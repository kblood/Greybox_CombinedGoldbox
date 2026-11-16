"""Ordinary held opening through native read-only dispatch and menu presenter."""
import struct,hashlib
import pytest
from tools.test_secret_narration_native import (producer_image,consumers,PipelineMachine,held_names,
                                               page_machine,WhoPageMachine,render_pages)
from tools.test_secret_print import AMIGA,SOURCE_SHA
from tools.test_secret_sidecar_dispatch import binaries,route,next_image,Route
from tools.test_secret_continuation import prepared,inputs
from tools.test_secret_who_frontends import Machine as FrontMachine
from tools.test_ccfp_menu_automation import compile_image
from tools.test_secret_continuation_io import BASE,x86
from tools.test_secret_print import pack
from tools.test_secret_initial_cursor import initial,setup_initial
from tools.test_secret_continuation_coordinator import image as coordinator_image,public_run
from tools.test_secret_continuation import with_part
from tools.secret_continuation import encode,decode


@pytest.fixture(scope='module')
def opening(producer_image,consumers):
    source=AMIGA.read_bytes();assert hashlib.sha256(source).hexdigest()==SOURCE_SHA
    m=PipelineMachine(consumers['flow'],producer_image,{'C:\\TEXT.GLB':source,'C:\\N.GWN':held_names()})
    tail=' C:\\TEXT.GLB 16 /ID4 /B C:\\N.GWN /9 1 /! /E C:\\TEXT.EFX'
    m.uc.mem_write(BASE+0x80,bytes([len(tail)])+tail.encode()+b'\r');m.call('start')
    assert m.exit==0 and len(m.children)==1
    effect=bytes(m.files['C:\\TEXT.EFX']);stream=bytes(m.files['C:\\TEXT.GBS'])
    # Exact captured public failure inputs, regenerated from held source.
    assert hashlib.sha256(effect).hexdigest()=='c78bc08bf50000a9cc65b67f1d75901640e05ecf2d182e1d8cb1b3a517d5fe62'
    assert hashlib.sha256(stream).hexdigest()=='93e05969a86c5b2f2d07ec173072c25884707d0af0b4aac839a9f2f74c99dd7e'
    assert struct.unpack_from('<10H',effect,5754)==(1,32642,1,43,3,0,6940,16,32642,43)
    return effect,stream,source


def files_for(opening,prepared):
    effect,stream,source=opening
    identity=struct.pack('<4s2H2I',b'GBID',1,16,len(source),0)+source
    return {'C:\\FX.EFX':effect,'C:\\FX.GBS':stream,'C:\\FX.IDN':identity,
            'C:\\PARTY.GBP':prepared.part('roster'),'D:\\DISK2\\ECL.GLB':source}


@pytest.mark.parametrize('relative',[False,True])
def test_actual_opening_readonly_dispatch_uses_producer_drive_cwd(binaries,prepared,opening,relative):
    files=files_for(opening,prepared)
    # A same-name decoy must never replace the producer's D:\DISK2 source.
    files['C:\\ECL.GLB']=b'wrong source on tool drive'
    m=route(binaries,files);m.current_drive='D';m.cwd_by_drive['D']='\\DISK2'
    if relative:m.put('eventpath',b'ECL.GLB\0')
    assert not m.call('apply_sidecar_damage_roster'),(m.children,m.child_exit)
    assert m.child_exit==0 and m.files==files
    assert m.children[-1].endswith('D:\\DISK2\\ECL.GLB')
    assert not any(e['ax']>>8 in (0x3c,0x40,0x41,0x56) for e in m.child_events)


def test_exact_opening_horizontal_menu_full_pages_and_bound_response(consumers,opening):
    effect,stream,_=opening
    m=page_machine(consumers,effect,stream)
    m.put('ackname',b'C:\\ANSWER.GMO\0')
    assert not m.call('open_effect_sidecar');m.put('sidecar_active',b'\1')
    assert not m.call('validate_ack_effect')
    pages=render_pages(page_machine(consumers,effect,stream))
    assert [len(page) for page in pages]==[117,38]
    m.manual_answer=b'1'
    assert not m.call('show_pending_menu') and m.get('menu_selected',2)==b'\0\0'
    assert not m.call('write_pending_outcome')
    assert struct.unpack('<4s7H',m.files['C:\\ANSWER.GMO'])==(b'GBMO',2,0,1,6940,16,32642,43)
    assert bytes(m.files['C:\\TEXT.EFX'])[5778:5948]==effect[5778:5948]


@pytest.fixture(scope='module')
def menu_image(tmp_path_factory):
    return compile_image(tmp_path_factory.mktemp('ordinary-horizontal-menu'),'ccmenu',
                         ('parse_args','read_effect','validate_effect','read_player_choice','write_outcome','selected','fxbuf'))


class ConsoleMenu(FrontMachine):
    def interrupt(self,uc,number,unused):
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x4400:
            uc.reg_write(x86.UC_X86_REG_DX,0x80)
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        return super().interrupt(uc,number,unused)


def test_existing_ccmenu_horizontal_response_semantics(menu_image,opening):
    effect,_,_=opening
    # CCMENU's admitted direct32 layout is the old public route. Sidecar
    # presentation is intentionally delegated to CCFP, not bypassed here.
    direct=bytearray(effect);struct.pack_into('<H',direct,6,struct.unpack_from('<H',direct,6)[0]&~0x100)
    from tools.test_secret_print import decode_original_model
    from tools.secret_continuation import source_member
    member=source_member(AMIGA.read_bytes(),16);text=decode_original_model(member[272:389])[:32].encode()
    direct[3532+2*34:3566+2*34]=struct.pack('<H',32)+text
    m=ConsoleMenu(menu_image,{'C:\\WHO.EFX':bytes(direct)})
    tail='C:\\WHO.EFX C:\\ANSWER.GMO';m.uc.mem_write(BASE+0x80,bytes([len(tail)])+tail.encode()+b'\r')
    assert not m.call('parse_args') and not m.call('read_effect') and not m.call('validate_effect')
    m.manual_answer=b'1';assert not m.call('read_player_choice')
    assert m.uc.reg_read(x86.UC_X86_REG_AX)==0
    m.put('selected',b'\0\0');assert not m.call('write_outcome')
    assert struct.unpack('<4s7H',m.files['C:\\ANSWER.GMO'])==(b'GBMO',2,0,1,6940,16,32642,43)


def horizontal_packet(opening,options=3,codec=2):
    effect,stream,_=opening;effect=bytearray(effect)
    struct.pack_into('<H',effect,5758,options)
    struct.pack_into('<H',effect,2252+3*20+6,options)
    struct.pack_into('<H',effect,5790,options)
    labels=b''.join(bytes([len(pack(text))])+pack(text) for text in ('FIRST','SECOND','THIRD')[:options])
    effect[5792:5920]=labels+bytes(128-len(labels))
    stream=bytearray(stream);stream[8+3*54:8+4*54]=effect[2312:2332]+effect[3634:3668]
    if codec==0:
        # Old fixed stream retains the authoritative original32 prefix.
        from tools.secret_continuation import source_member
        text=__import__('tools.test_secret_print',fromlist=['decode_original_model']).decode_original_model(source_member(AMIGA.read_bytes(),16)[272:389])[:32].encode()
        effect[3600:3634]=struct.pack('<H',32)+text
        stream=struct.pack('<4s2H',b'GBSL',1,4)+b''.join(effect[2252+i*20:2272+i*20]+effect[3532+i*34:3566+i*34] for i in range(4))
    else:struct.pack_into('<H',stream,8+4*54+4,codec)
    return bytes(effect),bytes(stream)


class HorizontalPage(WhoPageMachine):
    def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.console=bytearray();self.lines=[];self.inputs=0
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if number==0x21 and ax>>8==2:self.console.append(uc.reg_read(x86.UC_X86_REG_DX)&255);return
        if number==0x21 and ax>>8==0x0a:
            self.inputs+=1
            assert self.lines,'undeclared manual numeric input'
            self.manual_answer=self.lines.pop(0)
        return super().interrupt(uc,number,unused)


def presenter(consumers,effect,stream):
    m=HorizontalPage(consumers['page'],{'C:\\TEXT.EFX':effect,'C:\\TEXT.GBS':stream,'C:\\ANSWER.GMO':b'bound answer sentinel'})
    m.put('loadbuf',effect);m.put('fxreadlen',struct.pack('<H',len(effect)))
    m.put('fx_physical_len',struct.pack('<H',len(effect)));m.put('effectname',b'C:\\TEXT.EFX\0');m.put('ackname',b'C:\\ANSWER.GMO\0')
    if m.call('open_effect_sidecar'):return m,True
    m.put('sidecar_active',b'\1')
    return m,m.call('validate_ack_effect')


@pytest.mark.parametrize('codec',[0,1,2])
def test_multioption_labels_manual2_token1_across_closed_stream_versions(consumers,opening,codec):
    effect,stream=horizontal_packet(opening,codec=codec)
    m,bad=presenter(consumers,effect,stream);assert not bad
    m.lines=[b'2'];assert not m.call('show_pending_menu')
    assert m.inputs==1 and m.get('menu_selected',2)==b'\1\0'
    assert b'1. FIRST\r\n2. SECOND\r\n3. THIRD\r\n' in m.console
    assert not m.call('write_pending_outcome')
    assert struct.unpack('<4s7H',m.files['C:\\ANSWER.GMO'])==(b'GBMO',2,1,3,6940,16,32642,43)
    assert bytes(m.files['C:\\TEXT.EFX'])==effect


@pytest.mark.parametrize('value',[b'0',b'4',b'65535',b'65536',b'-1',b'',b'3'])
def test_manual_domain_rejects_before_token_then_accepts_declared_next_input(consumers,opening,value):
    effect,stream=horizontal_packet(opening)
    m,bad=presenter(consumers,effect,stream);assert not bad
    m.lines=[value] if value==b'3' else [value,b'2']
    before={k:bytes(v) for k,v in m.files.items()}
    assert not m.call('show_pending_menu')
    assert m.inputs==(1 if value==b'3' else 2)
    assert m.get('menu_selected',2)==(b'\2\0' if value==b'3' else b'\1\0') and m.files==before


@pytest.mark.parametrize('value,accepted',[(0,True),(1,True),(2,True),(3,False),(65535,False)])
def test_zero_based_automation_bounded_independently_of_manual_conversion(consumers,opening,value,accepted):
    effect,stream=horizontal_packet(opening)
    m,bad=presenter(consumers,effect,stream);assert not bad
    m.put('menu_auto',b'\1');m.put('menu_auto_answer',struct.pack('<H',value))
    m.put('effect_text_slot',b'\xff\xff')
    before={k:bytes(v) for k,v in m.files.items()}
    assert m.call('validate_auto_answer')!=accepted and m.call('show_pending_menu')!=accepted
    assert m.files==before and m.inputs==0
    if accepted:assert m.get('menu_selected',2)==struct.pack('<H',value)


@pytest.mark.parametrize('codec',[0,1,2])
@pytest.mark.parametrize('change',['GBRS','flags','version','GBSI','raw','status','count0','count256','menuflags',
                                   'reserved','destarg','countarg','argc','labelcount','extent','padding','terminal'])
def test_new_horizontal_admission_remains_closed_before_any_response(consumers,opening,codec,change):
    effect,stream=horizontal_packet(opening,codec=codec);effect=bytearray(effect);stream=bytearray(stream)
    if change=='GBRS':effect[116:120]=b'FAIL'
    elif change=='flags':struct.pack_into('<H',effect,120,5)
    elif change=='version':struct.pack_into('<H',effect,4,15)
    elif change=='GBSI':effect[5932:5936]=b'FAIL'
    elif change=='raw':effect[5924]=2
    elif change=='status':struct.pack_into('<H',effect,8,3)
    elif change in ('count0','count256'):struct.pack_into('<H',effect,5758,0 if change=='count0' else 256)
    elif change=='menuflags':struct.pack_into('<H',effect,5754,2)
    elif change=='reserved':struct.pack_into('<H',effect,5764,1)
    elif change=='destarg':struct.pack_into('<H',effect,2252+3*20+4,1234)
    elif change=='countarg':struct.pack_into('<H',effect,2252+3*20+6,4)
    elif change=='argc':struct.pack_into('<H',effect,2252+3*20+2,1)
    elif change=='labelcount':struct.pack_into('<H',effect,5790,4)
    elif change=='extent':effect[5792]=255
    elif change=='padding':effect[5919]=1
    else:struct.pack_into('<H',stream,8+3*54,0x15)
    # Bind altered fixed terminal row too: test the actual shape, not merely
    # an unrelated terminal-correspondence mismatch.
    if change in ('destarg','countarg','argc'):stream[8+3*54:8+4*54]=effect[2312:2332]+effect[3634:3668]
    m,bad=presenter(consumers,bytes(effect),bytes(stream));assert bad
    assert bytes(m.files['C:\\ANSWER.GMO'])==b'bound answer sentinel' and bytes(m.files['C:\\TEXT.EFX'])==bytes(effect)
    assert not any(e['ax']>>8 in (0x3c,0x40) for e in m.events)


def test_horizontal_close_failure_preserves_full_effect_and_existing_answer(consumers,opening):
    effect,stream=horizontal_packet(opening)
    m,bad=presenter(consumers,effect,stream);assert not bad
    m.put('menu_selected',b'\1\0');before={k:bytes(v) for k,v in m.files.items()};bank=m.get('loadbuf',5948)
    m.fault='close';assert m.call('write_pending_outcome')
    assert m.files==before and m.get('loadbuf',5948)==bank


@pytest.mark.parametrize('fault',['carry-first','carry-second','carry-third','long','tail-overflow'])
def test_canonical_argument_failures_precede_exec_and_preserve_drive_cwd(binaries,prepared,opening,fault):
    class CanonicalFault(Route):
        calls=0
        def interrupt(self,uc,number,unused):
            if uc.reg_read(x86.UC_X86_REG_AX)==0x6000:
                self.calls+=1
                target=(uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
                ordinal={'carry-first':1,'carry-second':2,'carry-third':3}.get(fault)
                if self.calls==ordinal:
                    uc.reg_write(x86.UC_X86_REG_AX,3)
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1);return
                if fault in ('long','tail-overflow'):
                    value='C:\\'+'A'*110 if fault=='long' else 'C:\\'+('ABCDEFGH\\'*10)+'FILE.EFX'
                    uc.mem_write(target,value.encode()+b'\0')
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
            return super().interrupt(uc,number,unused)
    files=files_for(opening,prepared);base=route(binaries,files)
    m=CanonicalFault(binaries['boot'],files);m.binaries=binaries
    # Transfer only declared caller inputs, not unrelated machine state.
    for label,size in [('effectpath',112),('rosterpath',112),('eventpath',112),('child_host',112),('toolprefix',112),
                       ('effectreadp',2),('eclp',2),('gamep',2),('secret_profile',1),('secret_party',1),('secret_next_ready',1)]:
        m.put(label,base.get(label,size))
    m.current_drive='D';m.cwd_by_drive['D']='\\DISK2';m.put('eventpath',b'ECL.GLB\0')
    assert m.call('apply_sidecar_damage_roster',ES=0xA000)
    assert not m.children and m.files==files and m.current_drive=='D' and m.cwd_by_drive['D']=='\\DISK2'


def test_presenter_read_failure_after_first_page_cannot_publish_answer(consumers,opening):
    effect,stream=horizontal_packet(opening)
    m,bad=presenter(consumers,effect,stream);assert not bad
    m.put('effectmode',b'\1');m.put('effect_text_slot',b'\xff\xff')
    assert not m.call('build_sidecar_effect_page',BX=0)
    assert m.get('effect_text_len',1)==bytes([117])
    before={k:bytes(v) for k,v in m.files.items()}
    m.fault='read';m.call('advance_effect_text')
    assert m.get('sidecar_fault',1)==b'\1' and m.call('show_pending_menu') and m.call('write_pending_outcome')
    assert m.files==before and m.inputs==0


def test_exact_opening_native_initial_publication_and_no_answer_reopen(coordinator_image,prepared,opening):
    effect,stream,source=opening
    p=initial(prepared)
    p=with_part(p,'paused',effect);p=with_part(p,'stream',stream)
    p=with_part(p,'identity',struct.pack('<4s2H2I',b'GBID',1,16,len(source),0)+source)
    m=setup_initial(coordinator_image,p)
    frozen=bytes(m.files[p.paths[8]]);assert frozen==encode(p) and decode(frozen)==p
    assert public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert bytes(m.files[p.paths[8]])==frozen and not m.children
    assert bytes(m.files['C:\\PAUSED.GBS'])==stream and p.paths[6] not in m.files
