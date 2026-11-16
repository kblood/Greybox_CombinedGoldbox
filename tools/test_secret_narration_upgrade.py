"""Declared legacy codec fixture: native reopen, real answer, native producer.

This authored compatibility authority is separate from the genuine released248
public snapshots and from the primary fresh public runtime proof.
"""
from dataclasses import replace
import struct

from tools.secret_continuation import (encode,decode,bind_result,make_receipt,activate,projected_roster)
from tools.test_secret_continuation import prepared,inputs,result,with_part
from tools.test_secret_continuation_coordinator import (Machine as Coordinator, image as coordinator_image,
                                                        prepared_machine,public_run)
from tools.test_secret_narration_native import (producer_image,consumers,old_reset_image,historical_sources,
                                               held_names,WhoPageMachine,PipelineMachine,WorkingWhole)
from tools.test_secret_print import packed_values
from tools.test_secret_native_fields import glib
from tools.test_secret_continuation_io import BASE,x86
from unicorn import UC_HOOK_CODE


class NativeProducerCoordinator(Coordinator):
    def __init__(self,*args,consumers,producer,**kwargs):
        super().__init__(*args,**kwargs);self.consumers=consumers;self.producer=producer;self.productions=[]
        self.trace=[];self.failures=[];self.uc.hook_add(UC_HOOK_CODE,self.observe)
    def observe(self,uc,address,size,unused):
        self.trace.append(address-BASE)
        if len(self.trace)>32:self.trace.pop(0)
        if address-BASE in [self.labels[k] for k in ('kv_bad','kn_bad','kw_fail')]:
            self.failures.append({'trace':self.trace.copy(),'registers':{r:uc.reg_read(getattr(x86,'UC_X86_REG_'+r)) for r in ('AX','BX','CX','DX','SI','DI','BP')}})
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax==0x4b00:
            path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            if path.endswith('CCFLOW.COM'):
                length=self.get('kn_tail',1)[0];tail=self.get('kn_tail',128)[1:1+length].decode()
                self.children.append((path,tail))
                flow=PipelineMachine(self.consumers['flow'],self.producer,{k:bytes(v) for k,v in self.files.items()})
                flow.guest_cwd=self.cwd;flow.output_path=self.cwd+'\\O.EFX'
                flow.uc.mem_write(BASE+0x80,bytes([length])+tail.encode()+b'\r');flow.call('start')
                assert flow.exit==0,(flow.messages,flow.children)
                self.files={k:bytearray(v) for k,v in flow.files.items()}
                self.productions.append(flow.children)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        return super().interrupt(uc,number,unused)


def test_real_old_codec_reopen_answer_then_native_new_codec_generation(prepared,coordinator_image,producer_image,consumers,old_reset_image):
    # Original248 producer establishes a real source-bound WHO checkpoint.
    # Its preceding long operand is declared as legacy extension1 for this
    # authored compatibility fixture; no retail/public authority is borrowed.
    raw=packed_values([1]*40+[0]+[2]*40)
    first=bytes((0x11,0x80,len(raw)))+raw
    program=first+b'\x39\x80\1\4'+first+b'\0'
    archive=glib(program)
    # Existing fixture paths own area16; change only the authored archive ID.
    archive=archive[:30]+b'\0\x10'+archive[32:]
    source_identity=struct.pack('<4s2H2I',b'GBID',1,16,len(archive),0)+archive
    p=replace(with_part(prepared,'identity',source_identity),interactive=True)
    old=WorkingWhole(old_reset_image,{'C:\\SRC.GLB':archive,'C:\\N.GWN':held_names()});old.exit=None
    assert old.run(' C:\\SRC.GLB 16 /ID4 /B C:\\N.GWN /! /E C:\\OLD.EFX')==0
    output=bytearray(old.files['C:\\OLD.EFX'])
    assert struct.unpack_from('<H',output,8)[0]==2 and struct.unpack_from('<H',output,2250)[0]==2
    assert struct.unpack_from('<H',output,3532)[0]==32
    # Preserve the old original packed bytes and explicit legacy decoder count.
    output[3532:3566]=struct.pack('<H4s4H',65535,b'DREF',16,23,len(raw),20+len(program))+bytes(20)
    struct.pack_into('<H',output,6,struct.unpack_from('<H',output,6)[0]|0x100)
    rows=[struct.pack('<10H',0x11,1,len(raw),*([0]*7))+struct.pack('<H4sH',65535,b'GBPX',0)+bytes(26),
          bytes(output[2272:2292])+bytes(output[3566:3600])]
    stream=(struct.pack('<4s2H',b'GBSL',2,2)+b''.join(rows)+struct.pack('<4s4H',b'GBPX',1,1,len(raw),0)
            +struct.pack('<4H',0,0,len(raw),40)+raw)
    bound=bind_result(p,result(p),b'party\r\n')
    current_roster=projected_roster(bound,result(p))
    legacy=activate(bound,bytes(output),stream=stream,
                    producer_receipt=make_receipt(bound,bytes(output),wrapper_exit=0,stream=stream),
                    settled_result=result(p)[:14]+b'\1\0'+result(p)[16:],settled_roster=current_roster)
    base=prepared_machine(coordinator_image,p)
    base.files[p.paths[8]]=bytearray(encode(legacy));base.files[p.paths[1]]=bytearray(current_roster)
    base.files[p.paths[3]]=bytearray(legacy.part('result')[:14]+b'\1\0'+legacy.part('result')[16:])
    base.files[p.paths[6]]=bytearray(legacy.part('outcome'))
    base.files.pop('C:\\PARTY.GSC',None)
    m=NativeProducerCoordinator(coordinator_image,{k:bytes(v) for k,v in base.files.items()},p,consumers=consumers,producer=producer_image)
    m.directories=base.directories.copy()
    frozen=encode(legacy)
    status=public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')
    if status!=2:
        import json
        print(json.dumps({'failures':m.failures,'events':m.events[-10:]}))
    assert status==2
    assert not m.children and bytes(m.files[p.paths[8]])==frozen
    assert bytes(m.files[p.paths[1]])==current_roster and bytes(m.files['C:\\NEXT.GBS'])==stream
    assert bytes(m.files[p.paths[7]])==bytes(output)
    # Actual CCFP validates the legacy pages, commits WHO and writes its token.
    page=WhoPageMachine(consumers['page'],{'C:\\NEXT.EFX':bytes(output),'C:\\NEXT.GBS':stream})
    page.put('effectname',b'C:\\NEXT.EFX\0');page.put('ackname',b'C:\\ANSWER.GMO\0')
    page.put('loadbuf',bytes(output));page.put('fxreadlen',struct.pack('<H',len(output)))
    page.put('fx_physical_len',struct.pack('<H',len(output)))
    assert not page.call('open_effect_sidecar');page.put('sidecar_active',b'\1')
    assert not page.call('validate_ack_effect');page.put('menu_selected',b'\3\0')
    assert not page.call('write_pending_outcome')
    m.files[p.paths[7]]=page.files['C:\\NEXT.EFX'];m.files[p.paths[6]]=page.files['C:\\ANSWER.GMO']
    assert public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert len(m.productions)==1 and len(m.productions[0])==1
    upgraded=decode(bytes(m.files[p.paths[8]]))
    new_stream=upgraded.part('stream');end=8+54*struct.unpack_from('<H',new_stream,6)[0]
    assert new_stream[end:end+6]==b'GBPX\2\0'
    assert struct.unpack_from('<H',new_stream,end+18)[0]==80 and new_stream.endswith(raw)
    assert upgraded.part('roster')==current_roster and bytes(m.files[p.paths[1]])==current_roster
    assert struct.unpack_from('<I',upgraded.part('successor'),126)[0]==0x1234
    assert struct.unpack_from('<2H',upgraded.part('successor'),5940)==(1,4)
    assert p.paths[6] not in m.files and decode(frozen)==legacy
    # No-answer repeat is read-only with respect to logical authority/producer.
    repeated=bytes(m.files[p.paths[8]]);calls=len(m.productions)
    assert public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert len(m.productions)==calls and bytes(m.files[p.paths[8]])==repeated
