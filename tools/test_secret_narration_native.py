"""Compiled Secret PRINT producer/transport/paging controls.

SECRET_NARRATION_FROZEN selects the released COM for the whole-CLI RED
controls. Normal runs compile private probes; shared native/build is untouched.
"""
import os
import struct
import subprocess
import shutil
import zipfile
import ntpath
from pathlib import Path
from functools import lru_cache

import pytest

from tools.test_ccfp_menu_automation import compile_image
from tools.test_secret_native_fields import Whole, glib
from tools.test_secret_print import AMIGA, SOURCE_SHA, pack, packed_values, decode_original_model
from tools.secret_continuation import source_member
from tools.secret_continuation import check_stream, packed_count
from tools.test_secret_continuation_write import Machine as FileMachine
from tools.test_ccfp_menu_automation import Machine as PageMachine, EXPORTS as PAGE_EXPORTS, word
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_continuation import prepared, inputs
import hashlib

ROOT = Path(__file__).resolve().parents[1]
PRODUCER_EXPORTS = ('start', 'record_operand_text', 'is_gen2', 'is_dax', 'cur_op',
                    'o_code', 'o_text_off', 'o_text_len', 'blk', 'fx_script_count',
                    'fx_script_texts', 'vm_reset_all', 'clock_slots', 'fx_geo')
FLOW_EXPORTS = ('start','read_effect','effectpath','resolve_reference','finalize_sidecar','side_record','fxbuf','sourcepath',
                'daxbuf','dax_raw_len','ref_decoded','text_codec','side_count','has_reference',
                'stagepath','sidepath','payloadpath','sourcefh','ref_off','ref_len')
DUMP_EXPORTS = ('validate_gbsl_v2','v2_count_packed','print_v2_text','v2_fh','v2_base',
                'v2_extent','v2_ext','v2_dir','v2_packed','version_seen','fxbuf','fx_len',
                'fx_physical_lo','fx_physical_hi','outfh','sidebuf','validate_v16_dump')
HOST_EXPORTS = ('validate_gbsl_v2','v2_count_packed','v2_fh','v2_base','v2_extent',
                'v2_ext','v2_dir','v2_packed')


@pytest.fixture(scope='module')
def consumers(tmp_path_factory):
    return {name: compile_image(tmp_path_factory.mktemp('narration-'+name), source, exports)
            for name,source,exports in [('flow','ccflow',FLOW_EXPORTS),
                                        ('page','ccfp',PAGE_EXPORTS+('open_effect_sidecar','fx_physical_len','fx_physical_hi','side_ext','effectmode','effect_text_slot','close_secret_text_sidecar','parse_menu_number','menu_input','show_horizontal_labels','save_pending_prompt')),
                                        ('dump','ccefx',DUMP_EXPORTS),
                                        ('host','cchost',HOST_EXPORTS)]}


class FlowMachine(FileMachine):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.source_fault = None
        self.bad_seek_return = False

    def interrupt(self,uc,number,unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax == 0x3d02:
            uc.reg_write(x86.UC_X86_REG_AX,0x3d00)
        if ax >> 8 == 0x41:
            name=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            carry=name not in self.files
            if not carry:del self.files[name]
            uc.reg_write(x86.UC_X86_REG_EFLAGS,(uc.reg_read(x86.UC_X86_REG_EFLAGS)|1) if carry else (uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1))
            return
        handle=uc.reg_read(x86.UC_X86_REG_BX)
        is_source=self.handles.get(handle,[''])[0]=='C:\\TEXT.GLB'
        saved=self.fault
        if is_source and self.source_fault:self.fault=self.source_fault
        try:super().interrupt(uc,number,unused)
        finally:self.fault=saved
        if is_source and ax==0x4200 and self.bad_seek_return:
            uc.reg_write(x86.UC_X86_REG_AX,uc.reg_read(x86.UC_X86_REG_AX)^1)


def fixed_rows(effect):
    count=struct.unpack_from('<H',effect,2250)[0]
    return [effect[2252+i*20:2272+i*20]+effect[3532+i*34:3566+i*34] for i in range(count)]


def transport(consumers,effect,source,**faults):
    rows=fixed_rows(effect)
    stream=struct.pack('<4s2H',b'GBSL',1,len(rows))+b''.join(rows)
    m=FlowMachine(consumers['flow'],{'C:\\TEXT.GLB':source,'C:\\TEXT.GBT':stream})
    for label,value in [('sourcepath',b'C:\\TEXT.GLB\0'),('stagepath',b'C:\\TEXT.GBT\0'),
                        ('sidepath',b'C:\\TEXT.GBS\0'),('payloadpath',b'C:\\TEXT.GBP\0')]:m.put(label,value)
    m.put('fxbuf',effect)
    m.put('side_count',struct.pack('<H',len(rows)))
    m.put('has_reference',bytes([any(row[20:22]==b'\xff\xff' for row in rows)]))
    for key,value in faults.items():setattr(m,key,value)
    return m,m.call('finalize_sidecar')


def page_machine(consumers,effect,stream):
    effect=bytearray(effect);struct.pack_into('<H',effect,6,struct.unpack_from('<H',effect,6)[0]|0x100)
    m=PageMachine(consumers['page'],{'C:\\TEXT.EFX':effect,'C:\\TEXT.GBS':stream})
    m.put('loadbuf',bytes(effect));m.put('fxreadlen',struct.pack('<H',len(effect)))
    m.put('fx_physical_len',struct.pack('<H',len(effect)))
    m.put('effectname',b'C:\\TEXT.EFX\0')
    m.put('effectmode',b'\1');m.put('effect_text_slot',b'\xff\xff')
    return m


def render_pages(m):
    assert not m.call('open_effect_sidecar')
    m.put('sidecar_active',b'\1')
    assert not m.call('build_sidecar_effect_page',BX=0,ES=0xA000)
    seen=[]
    for _ in range(80):
        seen.append(m.get('effect_text',m.get('effect_text_len',1)[0]))
        if m.call('advance_effect_text',ES=0xA000):break
    else:pytest.fail('finite narration paging did not terminate')
    assert m.get('sidecar_fault',1)==b'\0'
    assert m.uc.reg_read(x86.UC_X86_REG_ES)==0xA000
    return seen


@pytest.fixture(scope='module')
def producer_image(tmp_path_factory):
    frozen = os.environ.get('SECRET_NARRATION_FROZEN')
    if frozen:
        data = (Path(frozen)/'CCECL.COM').read_bytes()
        assert hashlib.sha256(data).hexdigest() == '8d289bbaf472eb68bc5c7c08bad7bc704c610126cdd4d3d428711fda723d728d'
        return data, {'start': 0x100}
    return compile_image(tmp_path_factory.mktemp('secret-narration-producer'), 'ccecl', PRODUCER_EXPORTS)


def launch_print(image, program, coordinator=True, profile=4, source=None):
    machine = Whole(image, {'C:\\TEXT.GLB': source if source is not None else glib(program),'C:\\N.GWN':held_names()})
    if coordinator:
        machine.uc.mem_write(0x10000+0x5c, b'GBLR')
    machine.exit = None
    assert machine.run(f' C:\\TEXT.GLB 49 /ID{profile} /B C:\\N.GWN /E C:\\TEXT.EFX') == 0
    return machine, bytes(machine.files['C:\\TEXT.EFX'])


@lru_cache(maxsize=1)
def held_names():
    from tools.test_secret_player_stats import PLAYER_HASHES
    from tools.secret_melee_oracle import DEFAULT_ROOT
    names=[]
    for hero in range(1,7):
        name=f'CHRDATA{hero}.SAV';raw=(DEFAULT_ROOT/name).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==PLAYER_HASHES[name]
        names.append(raw[:raw[0]+1]+bytes(15-raw[0]))
    return struct.pack('<4s6H',b'GBWN',1,112,6,4,4768,0)+b''.join(names)


def held_instruction(pc):
    source = AMIGA.read_bytes()
    assert hashlib.sha256(source).hexdigest() == SOURCE_SHA
    member = source_member(source, 16)
    return member[pc:pc+3+member[pc+2]]


@pytest.mark.parametrize('pc,characters', [(0x10d,155),(0x189,119),(0x1b39,36)])
def test_held_long_print_is_reference_with_exact_source_extent(producer_image, pc, characters):
    instruction = held_instruction(pc)
    _, effect = launch_print(producer_image, instruction+b'\0')
    text = effect[3532:3566]
    assert struct.unpack_from('<H',text)[0] == 65535
    assert struct.unpack_from('<4s4H',text,2) == (b'DREF',49,23,len(instruction)-3,len(instruction)+21)
    assert text[14:] == bytes(20)
    assert len(decode_original_model(instruction[3:])) == characters
    assert struct.unpack_from('<H',effect,124)[0] == 20+len(instruction)  # EXIT retains its own PC.


def test_early_embedded_zero_counts_nonzero_before_reference_cutoff(producer_image):
    raw = packed_values([1,0,2]+[3]*38)
    _, effect = launch_print(producer_image, bytes((0x12,0x80,len(raw)))+raw+b'\0')
    assert effect[3532:3538] == b'\xff\xffDREF'
    assert struct.unpack_from('<H',effect,124)[0] == 23+len(raw)


def test_real_journal_three_operands_preserve_complete_reference(producer_image):
    instructions = [held_instruction(pc) for pc in (0x1ea,0x1b39,0x1fb)]
    _, effect = launch_print(producer_image,b''.join(instructions)+b'\0')
    texts = [effect[3532+34*i:3566+34*i] for i in range(3)]
    assert texts[0][2:2+struct.unpack_from('<H',texts[0])[0]] == b'HE CONTINUES,'
    assert texts[1][:6] == b'\xff\xffDREF'
    assert texts[2][2:5] == b'37.'
    assert ''.join(decode_original_model(i[3:]) for i in instructions) == 'HE CONTINUES, AND YOU RECORD IT IN JOURNAL ENTRY 37.'


@pytest.mark.parametrize('pc,length',[(0x10d,155),(0x189,119),(0x1b39,36)])
def test_complete_held_source_resolver_and_all_pages(producer_image,consumers,pc,length):
    instruction=held_instruction(pc)
    source=glib(instruction+b'\0')
    _,effect=launch_print(producer_image,instruction+b'\0')
    flow,bad=transport(consumers,effect,source)
    assert not bad and not flow.handles
    stream=bytes(flow.files['C:\\TEXT.GBS'])
    end=8+54*len(fixed_rows(effect))
    assert struct.unpack_from('<4s4H',stream,end)==(b'GBPX',2,1,len(instruction)-3,0)
    assert stream[-len(instruction[3:]):]==instruction[3:]
    assert struct.unpack_from('<4H',stream,end+12)==(0,0,len(instruction)-3,length)
    pages=render_pages(page_machine(consumers,effect,stream))
    assert b''.join(pages).decode()==decode_original_model(instruction[3:])
    assert all(len(page)<=117 for page in pages)


def test_exact_journal_short_long_short_rows(producer_image,consumers):
    instructions=[held_instruction(pc) for pc in (0x1ea,0x1b39,0x1fb)]
    program=b''.join(instructions)+b'\0'
    _,effect=launch_print(producer_image,program)
    flow,bad=transport(consumers,effect,glib(program));assert not bad
    pages=render_pages(page_machine(consumers,effect,bytes(flow.files['C:\\TEXT.GBS'])))
    assert b''.join(pages)==b'HE CONTINUES, AND YOU RECORD IT IN JOURNAL ENTRY 37.'


@pytest.mark.parametrize('characters',[0,1,31,32,33,117,155,254,255,300,339])
@pytest.mark.parametrize('zero_position',[0,1,16,31,32,33])
def test_original_skipzero_saturation_and_full_declared_pc(producer_image,consumers,characters,zero_position):
    values=[1]*characters;values.insert(min(zero_position,characters),0)
    raw=packed_values(values);assert len(raw)<=255
    instruction=bytes((0x12,0x80,len(raw)))+raw
    # The real following SAVE must execute after the entire declared operand.
    program=instruction+bytes.fromhex('09 00 77 01 00 4c 00')
    _,effect=launch_print(producer_image,program)
    from tools.test_secret_native_fields import memory
    assert memory(effect)[0x4c00]==119
    assert struct.unpack_from('<H',effect,124)[0]==20+len(instruction)+6
    if characters<=32:
        length=struct.unpack_from('<H',effect,3532)[0]
        assert length==characters and effect[3534:3534+length]==b'A'*characters
    else:
        flow,bad=transport(consumers,effect,glib(program));assert not bad
        pages=render_pages(page_machine(consumers,effect,bytes(flow.files['C:\\TEXT.GBS'])))
        assert b''.join(pages)==b'A'*min(characters,255)


@pytest.mark.parametrize('coordinator',[False,True])
@pytest.mark.parametrize('profile',[0,1,2])
@pytest.mark.parametrize('opcode',[0x11,0x12,0x39,0x0f,0x15,0x20])
def test_other_operands_profiles_and_direct_prefix_keep_legacy_policy(producer_image,coordinator,profile,opcode):
    # Direct helper isolates every call site's recording policy without
    # inventing opcode-specific arguments or actor capabilities.
    m=Whole(producer_image,{})
    m.put('is_gen2',bytes([profile]));m.put('is_dax',b'\0')
    m.put('cur_op',bytes([opcode]));m.put('o_code',b'\x80')
    raw=packed_values([1,0]+[2]*40)
    m.put('blk',raw);m.put('o_text_off',b'\0\0');m.put('o_text_len',struct.pack('<H',len(raw)))
    if coordinator:m.uc.mem_write(BASE+0x5c,b'GBLR')
    m.call('record_operand_text')
    secret=profile==2 and opcode in (0x11,0x12)
    expected=65535 if secret and coordinator else (32 if secret else 1)
    assert struct.unpack('<H',m.get('fx_script_texts',2))[0]==expected


@pytest.mark.parametrize('fault',['read','short-read','seek','close','wrong-seek-return'])
def test_glib_source_fault_cannot_publish(producer_image,consumers,fault):
    instruction=held_instruction(0x10d);program=instruction+b'\0'
    _,effect=launch_print(producer_image,program)
    options={'bad_seek_return':True} if fault=='wrong-seek-return' else {'source_fault':fault}
    flow,bad=transport(consumers,effect,glib(program),**options)
    assert bad and 'C:\\TEXT.GBS' not in flow.files
    assert bytes(flow.files['C:\\TEXT.GLB'])==glib(program)


@pytest.mark.parametrize('change',['magic','size','method','kind','data','count-low','count-high',
                                   'pointer-before-table','pointer-backwards','last-pointer',
                                   'id-span','id-count','id-index','id-area','raw-size'])
def test_glib_header_pointer_and_member_ownership_closed(producer_image,consumers,change):
    instruction=held_instruction(0x10d);program=instruction+b'\0'
    _,effect=launch_print(producer_image,program)
    source=bytearray(glib(program))
    edits={'magic':(0,b'HLIB'),'size':(4,struct.pack('>I',len(source)+1)),
           'method':(10,b'\1'),'kind':(11,b'\0'),'data':(12,b'XXXX'),
           'count-low':(8,b'\0\1'),'count-high':(8,b'\1\0'),
           'pointer-before-table':(16,struct.pack('>I',16)),
           'pointer-backwards':(20,struct.pack('>I',27)),
           'last-pointer':(24,struct.pack('>I',len(source)-1)),
           'id-span':(20,struct.pack('>I',35)),'id-count':(28,b'\x80\1'),
           'id-index':(32,b'\0\2'),'id-area':(30,b'\0\x30')}
    if change=='raw-size':effect=effect[:3544]+struct.pack('<H',999)+effect[3546:]
    else:
        offset,data=edits[change];source[offset:offset+len(data)]=data
    flow,bad=transport(consumers,effect,bytes(source))
    assert bad and 'C:\\TEXT.GBS' not in flow.files


def bundle(producer_image,consumers,raw=None):
    raw=raw if raw is not None else packed_values([1]*40+[0]+[2]*40)
    program=bytes((0x12,0x80,len(raw)))+raw+b'\0'
    _,effect=launch_print(producer_image,program)
    flow,bad=transport(consumers,effect,glib(program));assert not bad
    stream=bytes(flow.files['C:\\TEXT.GBS'])
    effect=bytearray(effect);struct.pack_into('<H',effect,6,0x100|struct.unpack_from('<H',effect,6)[0])
    return bytes(effect),stream


class DumpMachine(FlowMachine):
    def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.output=bytearray()
    def interrupt(self,uc,number,unused):
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==2:
            self.output.append(uc.reg_read(x86.UC_X86_REG_DX)&255);return
        super().interrupt(uc,number,unused)


def diagnostic(consumers,tool,effect,stream):
    m=DumpMachine(consumers[tool],{'C:\\TEXT.GBS':stream})
    handle=m.open_other('C:\\TEXT.GBS')
    m.put('v2_fh',struct.pack('<H',handle));m.put('v2_extent',struct.pack('<H',len(stream)))
    if tool=='dump':
        m.put('version_seen',effect[4:6]);m.put('fxbuf',effect)
        m.put('fx_len',struct.pack('<H',len(effect)))
        m.put('fx_physical_lo',struct.pack('<H',len(effect)))
    return m


@pytest.mark.parametrize('codec',[1,2])
@pytest.mark.parametrize('length',[33,40,255,300,340])
def test_legacy_and_secret_diagnostic_count_and_render(producer_image,consumers,codec,length):
    raw=packed_values([2]*340) if length==340 else (packed_values([1]*40+[0]+[2]*max(0,length-40)) if length>=40 else pack('A'*length))
    effect,stream=bundle(producer_image,consumers,raw)
    stream=bytearray(stream);end=8+len(fixed_rows(effect))*54
    struct.pack_into('<H',stream,end+4,codec)
    decoded=packed_count(raw,codec)
    struct.pack_into('<H',stream,end+12+6,decoded)
    assert decoded>32
    expected=(decode_original_model(raw) if codec==2 else decode_original_model(raw).split('B',1)[0])
    if codec==1 and length<40:expected='A'*length
    if length==340:expected='B'*(340 if codec==1 else 255)
    check_stream(bytes(stream),effect)
    m=diagnostic(consumers,'dump',effect,bytes(stream))
    assert not m.call('validate_gbsl_v2')
    m.put('sidebuf',bytes(54));assert not m.call('print_v2_text')
    assert m.output.decode()==expected
    page=page_machine(consumers,effect,bytes(stream))
    assert b''.join(render_pages(page)).decode()==expected
    host=diagnostic(consumers,'host',effect,bytes(stream))
    assert host.call('validate_gbsl_v2')==(codec==2)
    assert not any(e['ax']>>8 in (0x3c,0x40,0x56) for e in host.events)


@pytest.mark.parametrize('change',['future','extzero','flags0','flags1','old5','missing4','missing8',
                                   'futureflags','pending12','generic','short','badGBRS',
                                   'badGBSI','rawflag','reserved','decoded','directory','tag','packed'])
def test_closed_codec_context_before_render_or_answer(producer_image,consumers,change):
    effect,stream=bundle(producer_image,consumers)
    effect=bytearray(effect);stream=bytearray(stream);end=8+len(fixed_rows(effect))*54
    if change in ('future','extzero'):struct.pack_into('<H',stream,end+4,3 if change=='future' else 0)
    elif change in ('flags0','flags1','old5','missing4','missing8','futureflags'):
        struct.pack_into('<H',effect,120,{'flags0':0,'flags1':1,'old5':5,'missing4':8,'missing8':4,'futureflags':0x800c}[change])
    elif change=='pending12':struct.pack_into('<H',effect,8,3)
    elif change=='generic':struct.pack_into('<H',effect,4,15)
    elif change=='short':del effect[-1]
    elif change=='badGBRS':effect[116:120]=b'FAIL'
    elif change=='badGBSI':effect[5932:5936]=b'FAIL'
    elif change=='rawflag':effect[5924]=2
    elif change=='reserved':struct.pack_into('<H',stream,end+10,1)
    elif change=='decoded':struct.pack_into('<H',stream,end+18,79)
    elif change=='directory':struct.pack_into('<H',stream,end+12,1)
    elif change=='tag':stream[36]=1
    elif change=='packed':stream[-1]=0  # Remove the final nonzero symbol: exact count changes.
    with pytest.raises(ValueError):check_stream(bytes(stream),bytes(effect))
    page=page_machine(consumers,bytes(effect),bytes(stream));before=dict(page.files)
    assert page.call('open_effect_sidecar')
    assert page.files==before and page.get('effect_text_len',1)==b'\0'
    dump=diagnostic(consumers,'dump',bytes(effect),bytes(stream))
    assert dump.call('validate_gbsl_v2') and not dump.output
    assert not any(e['ax']>>8 in (0x3c,0x40,0x56) for e in page.events+dump.events)


@pytest.fixture(scope='module')
def historical_sources(tmp_path_factory):
    folder=tmp_path_factory.mktemp('released248-source')
    archive=folder/'source.zip'
    subprocess.run(['git','archive','--format=zip','-o',str(archive),'4149067e','native/src'],cwd=ROOT,capture_output=True,check=True)
    with zipfile.ZipFile(archive) as source:source.extractall(folder)
    return folder/'native/src'


@pytest.fixture(scope='module')
def old_reset_image(tmp_path_factory,producer_image,historical_sources):
    folder=tmp_path_factory.mktemp('old-reset')
    src=historical_sources/'ccecl.asm'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    raw=folder/'old.com'
    run=subprocess.run([nasm,'-I',str(historical_sources)+'/', '-f','bin',str(src),'-o',str(raw)],capture_output=True)
    assert run.returncode==0,run.stderr
    assert hashlib.sha256(raw.read_bytes()).hexdigest()=='8d289bbaf472eb68bc5c7c08bad7bc704c610126cdd4d3d428711fda723d728d'
    wrapper=folder/'probe.asm';binary=folder/'probe.bin'
    # Address alignment is declared, not flag masking: the final ADD SI,2
    # sees the identical operand address in both otherwise unchanged loops.
    delta=len(producer_image[0])-2*len(PRODUCER_EXPORTS)-len(raw.read_bytes())
    # The private padding follows the measured code delta; subsequent
    # semantics-preserving reclamation must not change ADD's address flags.
    assert delta >= 0
    wrapper.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(PRODUCER_EXPORTS)+'\ntimes '+str(delta)+' db 0\n%include "'+src.as_posix()+'"\n')
    run=subprocess.run([nasm,'-I',str(historical_sources)+'/', '-f','bin',str(wrapper),'-o',str(binary)],capture_output=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();labels=dict(zip(PRODUCER_EXPORTS,struct.unpack_from('<'+'H'*len(PRODUCER_EXPORTS),data)))
    assert labels['clock_slots']==producer_image[1]['clock_slots']
    return data,labels


@pytest.fixture(scope='module')
def old_flow_image(tmp_path_factory,historical_sources):
    binary=tmp_path_factory.mktemp('released248-flow')/'ccflow.com'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(historical_sources)+'/', '-f','bin',str(historical_sources/'ccflow.asm'),'-o',str(binary)],capture_output=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes()
    assert hashlib.sha256(data).hexdigest()=='1d72b81b9f7187a9ebd11dd08a8a502852cd62fa2dc8a8c25ac0b29506e43310'
    return data,{'start':0x100}


@pytest.mark.parametrize('profile',[0,1,2])
@pytest.mark.parametrize('poison',[0x0000,0xffff,0xa57b])
def test_aliased_clock_and_geo_reset_is_compiled_old_equivalent(producer_image,old_reset_image,profile,poison):
    observed=[]
    for image in (old_reset_image,producer_image):
        m=Whole(image,{})
        m.put('is_gen2',bytes([profile]));m.put('clock_slots',struct.pack('<7H',*([poison]*7)))
        m.put('fx_geo',struct.pack('<H',poison))
        m.call('vm_reset_all',SI=0x1234,CX=0xabcd,EFLAGS=0x8d7)
        registers={r:m.uc.reg_read(getattr(x86,'UC_X86_REG_'+r)) for r in ('AX','BX','CX','DX','DI','BP','EFLAGS','DS','ES','FS','GS')}
        registers['SI-relative']=m.uc.reg_read(x86.UC_X86_REG_SI)-m.labels['clock_slots']
        observed.append((m.get('clock_slots',14),m.get('fx_geo',2),registers))
        assert m.get('clock_slots',14)==bytes(14) and m.get('fx_geo',2)==b'\xff\xff'
        m.put('clock_slots',b'\xa7'*14);m.put('fx_geo',b'\0\0')
        m.call('vm_reset_all');assert m.get('clock_slots',14)==bytes(14) and m.get('fx_geo',2)==b'\xff\xff'
    assert observed[0]==observed[1]


def wide_glib(program,*,table_offset=28,members=2,entries=1):
    table=struct.pack('>H',entries)+b''.join(struct.pack('>HH',1000+i,1) for i in range(entries-1))+struct.pack('>HH',49,members-1)
    pointer_end=16+4*(members+1)
    table_offset=max(table_offset,pointer_end)
    first=table_offset+len(table);body=bytes(20)+program;end=first+len(body)
    pointers=[table_offset]+[first]*(members-1)+[end]
    # Members1..members-2 are empty unrelated spans; selected last member is complete.
    return (b'GLIB'+struct.pack('>IHBB',end,members,0,1)+b'DATA'+struct.pack('>'+'I'*len(pointers),*pointers)
            +bytes(table_offset-pointer_end)+table+body)


@pytest.mark.parametrize('table_offset',[28,65535,65536,0x12340])
@pytest.mark.parametrize('members,entries',[(2,1),(255,127)])
def test_glib_exact_pointer_id_boundaries_and_u32_seek(producer_image,consumers,table_offset,members,entries):
    program=held_instruction(0x10d)+b'\0'
    source=wide_glib(program,table_offset=table_offset,members=members,entries=entries)
    assert source_member(source,49)==bytes(20)+program
    _,effect=launch_print(producer_image,program,source=source)
    flow,bad=transport(consumers,effect,source);assert not bad
    assert flow.files['C:\\TEXT.GBS'][-117:]==program[3:120]
    assert any(e['ax']==0x4200 and e['cx']>0 for e in flow.events)==(table_offset>=65535)


@pytest.mark.parametrize('members,entries',[(256,1),(255,128)])
def test_glib_beyond_native_pointer_or_id_byte_cap_rejects(producer_image,consumers,members,entries):
    program=held_instruction(0x10d)+b'\0'
    _,effect=launch_print(producer_image,program)
    flow,bad=transport(consumers,effect,wide_glib(program,members=members,entries=entries))
    assert bad and 'C:\\TEXT.GBS' not in flow.files


@pytest.mark.parametrize('raw_size',[14500,16000,16001])
def test_raw_member_cap_is_unchanged_and_never_truncated_by_resolver(producer_image,consumers,raw_size):
    program=held_instruction(0x10d)+b'\0'
    source=glib(program+bytes(raw_size-20-len(program)))
    _,effect=launch_print(producer_image,program,source=source)
    flow,bad=transport(consumers,effect,source)
    assert bad==(raw_size>16000)
    if not bad:assert b''.join(render_pages(page_machine(consumers,effect,bytes(flow.files['C:\\TEXT.GBS'])))).decode()==decode_original_model(program[3:120])
    else:assert 'C:\\TEXT.GBS' not in flow.files


def test_empty_operand_and_maximal_packed255_are_bounded(producer_image,consumers):
    _,empty=launch_print(producer_image,b'\x12\x80\0\0')
    assert empty[3532:3566]==bytes(34) and struct.unpack_from('<H',empty,124)[0]==23
    raw=packed_values([1]*340);assert len(raw)==255
    effect,stream=bundle(producer_image,consumers,raw)
    assert b''.join(render_pages(page_machine(consumers,effect,stream)))==b'A'*255
    assert stream[-255:]==raw


def test_uniform_codec_handles_early_short_chunks_before_first_reference(producer_image,consumers):
    # Genuine producer rows from separate invocations model the64-record spool
    # boundary; finalize_sidecar must choose one codec for all staged rows.
    short=bytes((0x11,0x80,2))+pack('A')
    assert len(short)==5
    _,early=launch_print(producer_image,short*64+b'\0')
    final_program=held_instruction(0x1b39)+b'\0'
    _,final=launch_print(producer_image,final_program)
    rows=fixed_rows(early)+fixed_rows(final)
    m=FlowMachine(consumers['flow'],{'C:\\TEXT.GLB':glib(final_program),
                                  'C:\\TEXT.GBT':struct.pack('<4s2H',b'GBSL',1,len(rows))+b''.join(rows)})
    for label,value in [('sourcepath',b'C:\\TEXT.GLB\0'),('stagepath',b'C:\\TEXT.GBT\0'),
                        ('sidepath',b'C:\\TEXT.GBS\0'),('payloadpath',b'C:\\TEXT.GBP\0')]:m.put(label,value)
    m.put('fxbuf',final);m.put('side_count',struct.pack('<H',65));m.put('has_reference',b'\1')
    assert not m.call('finalize_sidecar')
    stream=bytes(m.files['C:\\TEXT.GBS'])
    pages=render_pages(page_machine(consumers,final,stream))
    assert b''.join(pages)==b'A'*64+b' AND YOU RECORD IT IN JOURNAL ENTRY '


class PipelineMachine(FlowMachine):
    """Execute original CCFLOW instructions and actual compiled CCECL children."""
    def __init__(self,image,producer,files):
        super().__init__(image,files);self.producer=producer;self.children=[];self.child_exit=0;self.exit=None;self.messages=[]
        self.guest_cwd='C:\\';self.output_path='C:\\TEXT.EFX'
        self.uc.mem_write(BASE+0x2c,struct.pack('<H',0x800))
        self.uc.mem_write(0x8000,b'\0\0\1\0C:\\CCFLOW.COM\0')
    def path(self,address):
        name=super().path(address)
        if ntpath.isabs(name):return name
        return ntpath.normpath(ntpath.join(self.guest_cwd,name))
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax==0x6000:
            address=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            target=(uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
            name=self.path(address)
            if not name.startswith('C:\\'):name='C:\\'+name.split(':')[-1].lstrip('\\')
            uc.mem_write(target,name.encode()+b'\0')
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax>>8==0x47:
            target=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            uc.mem_write(target,self.guest_cwd[3:].encode()+b'\0');uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax==0x4b00:
            block=(uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_BX)
            _,offset,segment,fcb_offset,fcb_segment,_,_=struct.unpack('<7H',uc.mem_read(block,14))
            address=(segment<<4)+offset;size=uc.mem_read(address,1)[0]
            command=bytes(uc.mem_read(address+1,size)).decode()
            child=WorkingWhole(self.producer,{k:bytes(v) for k,v in self.files.items()});child.exit=None;child.guest_cwd=self.guest_cwd
            fcb=bytes(uc.mem_read((fcb_segment<<4)+fcb_offset,16))
            child.uc.mem_write(BASE+0x5c,fcb)
            self.child_exit=child.run(command)
            self.files={k:bytearray(v) for k,v in child.files.items()}
            output=bytes(self.files[self.output_path])
            self.children.append((command,output))
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax>>8==0x4d:uc.reg_write(x86.UC_X86_REG_AX,self.child_exit);return
        if ax>>8==0x4a:uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax>>8==0x4c:self.exit=ax&255;uc.reg_write(x86.UC_X86_REG_IP,0xff00);uc.emu_stop();return
        if ax>>8==9:
            address=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)
            self.messages.append(bytes(uc.mem_read(address,256)).split(b'$',1)[0]);return
        if ax>>8==2:return
        return super().interrupt(uc,number,unused)


class WorkingWhole(Whole):
    guest_cwd='C:\\'
    def path(self,address):
        name=super().path(address)
        if ntpath.isabs(name):return name
        return ntpath.normpath(ntpath.join(self.guest_cwd,name))


@pytest.mark.parametrize('events',[64,65,70,128,129])
def test_real_capacity_child_replay_keeps_uniform_codec_and_every_row(producer_image,consumers,events):
    short=b'\x11\x80\2'+pack('A')
    long=held_instruction(0x1b39)
    program=short*(events-1)+long+b'\0'
    m=PipelineMachine(consumers['flow'],producer_image,{'C:\\TEXT.GLB':glib(program),'C:\\N.GWN':held_names()})
    command=' C:\\TEXT.GLB 49 /ID4 /B C:\\N.GWN /E C:\\TEXT.EFX'
    m.uc.mem_write(BASE+0x80,bytes([len(command)])+command.encode()+b'\r')
    m.call('start')
    assert m.exit==0 and not m.handles,(m.messages,len(m.children),m.events[-8:])
    effect=bytes(m.files['C:\\TEXT.EFX']);stream=bytes(m.files['C:\\TEXT.GBS'])
    assert struct.unpack_from('<3H',stream,4)==(2,events,0x11)
    assert len(m.children)==(events+63)//64
    assert all(struct.unpack_from('<H',row,8)[0]==4 for _,row in m.children[:-1])
    assert struct.unpack_from('<H',effect,8)[0]==0
    pages=render_pages(page_machine(consumers,effect,stream))
    assert b''.join(pages)==b'A'*(events-1)+b' AND YOU RECORD IT IN JOURNAL ENTRY '
    assert struct.unpack_from('<H',effect,124)[0]==20+len(program)-1
    check_stream(stream,effect)


@pytest.mark.parametrize('first_secret',[False,True])
def test_first_inline_chunk_latches_class_before_a_later_reference(producer_image,consumers,first_secret):
    from tools.test_secret_continuation import effect
    _,secret=launch_print(producer_image,b'\x11\x80\2'+pack('A')+b'\0')
    legacy=effect(0)
    sequence=(legacy,secret) if not first_secret else (secret,legacy)
    m=FlowMachine(consumers['flow'],{'C:\\FIRST.EFX':sequence[0],'C:\\SECOND.EFX':sequence[1]})
    m.put('effectpath',b'C:\\FIRST.EFX\0');assert not m.call('read_effect')
    assert word(m,'text_codec')==(2 if first_secret else 1)
    m.put('effectpath',b'C:\\SECOND.EFX\0');before={k:bytes(v) for k,v in m.files.items()}
    assert m.call('read_effect') and m.files==before
    assert word(m,'text_codec')==(2 if first_secret else 1)
    assert not any(e['ax']>>8 in (0x3c,0x40,0x56) for e in m.events)


def test_legacy_schema_transitions_share_frozen_codec_class(consumers):
    from tools.test_secret_continuation import effect,menu_effect
    legacy=effect(0);v14=bytearray(menu_effect(0x15)[:5920]);struct.pack_into('<H',v14,4,14)
    m=FlowMachine(consumers['flow'],{})
    for index,data in enumerate((legacy,bytes(v14),menu_effect(0x15))):
        path=f'C:\\L{index}.EFX';m.files[path]=bytearray(data);m.put('effectpath',path.encode()+b'\0')
        assert not m.call('read_effect') and word(m,'text_codec')==1


def test_saturated_no_reference_v1_remains_byte_identical_to_frozen(producer_image,consumers,old_reset_image,old_flow_image):
    short=b'\x11\x80\2'+pack('A');program=short*70+b'\0'
    snapshots=[]
    pairs=((consumers['flow'],producer_image),(old_flow_image,old_reset_image))
    for image,producer in pairs:
        m=PipelineMachine(image,producer,{'C:\\TEXT.GLB':glib(program),'C:\\N.GWN':held_names()})
        command=' C:\\TEXT.GLB 49 /ID4 /B C:\\N.GWN /E C:\\TEXT.EFX'
        m.uc.mem_write(BASE+0x80,bytes([len(command)])+command.encode()+b'\r')
        m.call('start');assert m.exit==0 and not m.handles
        assert struct.unpack_from('<H',m.files['C:\\TEXT.GBS'],4)[0]==1
        snapshots.append({k:bytes(v) for k,v in m.files.items()})
    assert snapshots[0]==snapshots[1]


@pytest.mark.parametrize('fault',['read','short-read','seek'])
def test_new_codec_late_page_io_failure_preserves_answer(producer_image,consumers,fault):
    effect,stream=bundle(producer_image,consumers,packed_values([1]*255))
    m=page_machine(consumers,effect,stream);m.files['C:\\ANSWER.GMO']=bytearray(b'bound answer sentinel')
    m.put('ackname',b'C:\\ANSWER.GMO\0')
    assert not m.call('open_effect_sidecar');m.put('sidecar_active',b'\1')
    assert not m.call('build_sidecar_effect_page',BX=0)
    assert m.get('effect_text_len',1)==bytes([117])
    before={k:bytes(v) for k,v in m.files.items()}
    m.fault=fault;m.call('advance_effect_text')
    assert m.get('sidecar_fault',1)==b'\1' and m.call('write_pending_outcome')
    assert m.files==before and not any(e['ax']>>8 in (0x3c,0x40) for e in m.events)


@pytest.mark.parametrize('entry',['write_pending_outcome','write_ack_outcome'])
def test_new_codec_close_failure_precedes_any_answer_or_menu_edit(producer_image,consumers,entry):
    effect,stream=bundle(producer_image,consumers)
    m=page_machine(consumers,effect,stream);m.files['C:\\ANSWER.GMO']=bytearray(b'bound answer sentinel')
    m.put('ackname',b'C:\\ANSWER.GMO\0')
    assert not m.call('open_effect_sidecar');m.put('sidecar_active',b'\1')
    before={k:bytes(v) for k,v in m.files.items()}
    m.fault='close';assert m.call(entry)
    assert m.files==before and not any(e['ax']>>8 in (0x3c,0x40) for e in m.events)


def test_new_codec_checked_close_success_is_read_only(producer_image,consumers):
    effect,stream=bundle(producer_image,consumers)
    m=page_machine(consumers,effect,stream);assert not m.call('open_effect_sidecar')
    before={k:bytes(v) for k,v in m.files.items()}
    assert not m.call('close_secret_text_sidecar') and not m.handles and m.files==before


@pytest.mark.parametrize('count',[128,0x4001,0x8001,0xffff])
def test_id_count_rejects_large_word_without_shift_wrap(producer_image,consumers,count):
    program=held_instruction(0x10d)+b'\0';_,effect=launch_print(producer_image,program)
    source=bytearray(glib(program));struct.pack_into('>H',source,28,count)
    flow,bad=transport(consumers,effect,bytes(source))
    assert bad and 'C:\\TEXT.GBS' not in flow.files


def multi_area_glib(programs):
    count=len(programs)+1
    first=16+4*(count+1)
    table=struct.pack('>H',len(programs))+b''.join(struct.pack('>HH',area,index+1) for index,(area,_) in enumerate(programs))
    bodies=[table]+[bytes(20)+program for _,program in programs]
    pointers=[first]
    for body in bodies:pointers.append(pointers[-1]+len(body))
    return b'GLIB'+struct.pack('>IHBB',pointers[-1],count,0,1)+b'DATA'+struct.pack('>'+'I'*len(pointers),*pointers)+b''.join(bodies)


def test_real_newecl_resolves_selected_areas_and_ignores_unrelated_payload(producer_image,consumers):
    first=held_instruction(0x1b39)+bytes.fromhex('20 00 32')
    second=held_instruction(0x189)+b'\0'
    unused=b'\0'+b'X'*30
    results=[]
    for unused_program in (unused,b'\0'+b'Y'*30):
        source=multi_area_glib([(49,first),(50,second),(51,unused_program)])
        m=PipelineMachine(consumers['flow'],producer_image,{'C:\\TEXT.GLB':source,'C:\\N.GWN':held_names()})
        command=' C:\\TEXT.GLB 49 /ID4 /B C:\\N.GWN /E C:\\TEXT.EFX'
        m.uc.mem_write(BASE+0x80,bytes([len(command)])+command.encode()+b'\r');m.call('start')
        assert m.exit==0 and len(m.children)==1
        effect=bytes(m.files['C:\\TEXT.EFX']);stream=bytes(m.files['C:\\TEXT.GBS'])
        assert struct.unpack_from('<H',effect,122)[0]==50
        text=b''.join(render_pages(page_machine(consumers,effect,stream)))
        # The second area's PRINTCLEAR intentionally replaces the preceding
        # page composition; both original operands remain in the transport.
        assert text.decode()==decode_original_model(second[3:93])
        assert stream.endswith(first[3:30]+second[3:93])
        results.append((effect,stream,text))
    assert results[0]==results[1]


def test_real_dok_literal_keeps_legacy_codec_payload_and_spacing(producer_image,consumers):
    from tools.secret_melee_oracle import dax_members
    archive=(ROOT/'Death Knights of Krynn/ECL1.DAX').read_bytes()
    assert hashlib.sha256(archive).hexdigest()=='d2fe2c3937dfc71d692aa60e3e54d251a9a52dd708a457b04859090e2664dd44'
    body=bytearray(dax_members(archive)[16]);assert body[60:63]==b'\x12\x80\x9f' and body[222]==0x1d
    raw=bytes(body[63:222]);body[222]=0
    compressed=b''.join(bytes([len(body[i:i+128])-1])+bytes(body[i:i+128]) for i in range(0,len(body),128))
    source=struct.pack('<HB IHH',9,16,0,len(body),len(compressed))+compressed
    m=PipelineMachine(consumers['flow'],producer_image,{'C:\\TEXT.GLB':source})
    command=' C:\\TEXT.GLB 16 /E C:\\TEXT.EFX'
    m.uc.mem_write(BASE+0x80,bytes([len(command)])+command.encode()+b'\r');m.call('start')
    assert m.exit==0 and len(m.children)==1
    effect=bytes(m.files['C:\\TEXT.EFX']);stream=bytes(m.files['C:\\TEXT.GBS'])
    end=8+len(fixed_rows(effect))*54
    assert stream[end:end+6]==b'GBPX\1\0' and stream[-159:]==raw
    expected=decode_original_model(raw);assert len(expected)==212
    assert b''.join(render_pages(page_machine(consumers,effect,stream))).decode()==expected


@pytest.mark.parametrize('count,symbols,accepted',[(1212,78,True),(1212,80,False),(1213,33,False),(1214,33,False)])
def test_v2_record_and_exact65535_file_limits_are_unchanged(producer_image,consumers,count,symbols,accepted):
    raw=packed_values([1]*symbols);program=bytes((0x11,0x80,len(raw)))+raw+b'\0'
    _,effect=launch_print(producer_image,program)
    rows=[bytes(54)]*(count-1)+fixed_rows(effect)
    m=FlowMachine(consumers['flow'],{'C:\\TEXT.GLB':glib(program),
                                  'C:\\TEXT.GBT':struct.pack('<4s2H',b'GBSL',1,count)+b''.join(rows)})
    for label,value in [('sourcepath',b'C:\\TEXT.GLB\0'),('stagepath',b'C:\\TEXT.GBT\0'),
                        ('sidepath',b'C:\\TEXT.GBS\0'),('payloadpath',b'C:\\TEXT.GBP\0')]:m.put(label,value)
    m.put('fxbuf',effect);m.put('side_count',struct.pack('<H',count));m.put('has_reference',b'\1')
    assert m.call('finalize_sidecar')!=accepted
    if accepted:
        stream=bytes(m.files['C:\\TEXT.GBS']);assert len(stream)==65535
        flagged=effect[:6]+struct.pack('<H',struct.unpack_from('<H',effect,6)[0]|0x100)+effect[8:]
        check_stream(stream,flagged)
        assert b''.join(render_pages(page_machine(consumers,flagged,stream)))==b'A'*symbols
    else:assert 'C:\\TEXT.GBS' not in m.files


@pytest.mark.parametrize('prefix',['short-rows','long-row'])
def test_exact117_prefix_does_not_skip_next_unconsumed_long_event(producer_image,consumers,prefix):
    parts=[pack('A'*n) for n in (32,32,32,21)] if prefix=='short-rows' else [pack('A'*117)]
    parts.append(pack('B'*40))
    program=b''.join(bytes((0x11,0x80,len(raw)))+raw for raw in parts)+b'\0'
    _,effect=launch_print(producer_image,program)
    flow,bad=transport(consumers,effect,glib(program));assert not bad
    pages=render_pages(page_machine(consumers,effect,bytes(flow.files['C:\\TEXT.GBS'])))
    assert pages==[b'A'*117,b'B'*40]


class WhoPageMachine(PageMachine):
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax==0x6000:
            address=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            target=(uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
            uc.mem_write(target,self.path(address).encode()+b'\0')
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax==0x3d02:uc.reg_write(x86.UC_X86_REG_AX,0x3d00)
        return super().interrupt(uc,number,unused)


def test_actual_who_commit_close_failure_preserves_selection_effect_and_answer(consumers,prepared):
    from tools.test_secret_continuation_v16 import who
    from tools.test_secret_narration_authority import stream_for
    output=bytearray(who(prepared,1));struct.pack_into('<H',output,6,0x100|struct.unpack_from('<H',output,6)[0])
    stream=stream_for(bytes(output),2,[1]*40)
    m=WhoPageMachine(consumers['page'],{'C:\\TEXT.EFX':output,'C:\\TEXT.GBS':stream,
                                      'C:\\ANSWER.GMO':b'bound answer sentinel'})
    m.put('loadbuf',bytes(output));m.put('fxreadlen',struct.pack('<H',len(output)))
    m.put('fx_physical_len',struct.pack('<H',len(output)))
    m.put('effectname',b'C:\\TEXT.EFX\0');m.put('ackname',b'C:\\ANSWER.GMO\0')
    assert not m.call('open_effect_sidecar');m.put('sidecar_active',b'\1')
    assert not m.call('validate_ack_effect')
    m.put('menu_selected',b'\5\0')  # actor1 -> actor6 would change both suffixes.
    before={k:bytes(v) for k,v in m.files.items()};bank=m.get('loadbuf',5948)
    assert struct.unpack_from('<2H',bank,5782)==(1,1)
    m.fault='close';assert m.call('write_pending_outcome')
    assert m.files==before and m.get('loadbuf',5948)==bank
    assert not any(e['ax']>>8 in (0x3c,0x40) for e in m.events)


def test_last_page_caption_copy_preserves_vga_segment_and_memory(consumers):
    m=PageMachine(consumers['page'],{})
    text=b'CONVENIENCES, BUT OUR NEEDS ARE GREAT.'
    m.put('effect_text',text+b'\0');m.put('effect_text_len',bytes([len(text)]))
    m.put('pending_prompt',b'P'*118);m.put('pending_prompt_len',b'\x75')
    m.uc.mem_write(0xA0000,b'\xa7'*65536);vga=bytes(m.uc.mem_read(0xA0000,65536))
    m.call('save_pending_prompt',ES=0xA000,AX=0x55,CX=0x44,SI=0x3333,DI=0x4444)
    assert m.get('pending_prompt',len(text)+1)==text+b'\0'
    assert m.get('pending_prompt_len',1)==bytes([len(text)])
    assert bytes(m.uc.mem_read(0xA0000,65536))==vga
    for register,value in [('ES',0xA000),('AX',0x55),('CX',0x44),('SI',0x3333),('DI',0x4444)]:
        assert m.uc.reg_read(getattr(x86,'UC_X86_REG_'+register))==value
