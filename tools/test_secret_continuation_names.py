"""Compiled CCNEXT fresh GBWN admission; child reply is explicitly modeled."""
from dataclasses import replace
import struct
import pytest
from tools.secret_continuation import encode,decode,Context
from tools.test_secret_continuation import prepared,inputs
from tools.test_secret_continuation_coordinator import image,close_source
from tools.test_secret_continuation_metric import MetricMachine,completed_machine

class NamesMachine(MetricMachine):
    names_fault=None
    def interrupt(self,uc,num,arg):
        from tools.test_secret_continuation_io import x86
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 in (0x3f,0x3e,0x42) and self.names_fault in ('read','close','seek'):
            handle=self.handles.get(uc.reg_read(x86.UC_X86_REG_BX))
            wanted={'read':0x3f,'close':0x3e,'seek':0x42}[self.names_fault]
            if handle and handle[0].endswith('W.GWN') and ax >> 8 == wanted:
                if self.names_fault=='close':super().interrupt(uc,num,arg)
                uc.reg_write(x86.UC_X86_REG_AX,5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                return
        if ax >> 8 == 0x41 and self.names_fault=='delete':
            path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            if path.endswith('W.GWN'):
                uc.reg_write(x86.UC_X86_REG_AX,5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                return
        if ax==0x4b00:
            rawtail=self.get('kn_tail',128);tail=rawtail[1:1+rawtail[0]].decode()
            query=tail.startswith(' /W ')
            super().interrupt(uc,num,arg)
            if query:
                self.names_inputs.append(bytes(self.files[self.record.paths[1]]))
                reply=tail.split()[2];raw=self.files[reply]
                fault=self.names_fault
                if fault in ('absent','stale'):del self.files[reply]
                elif fault=='short':del raw[-1]
                elif fault=='extra':raw+=b'X'
                elif fault=='magic':raw[:4]=b'BAD!'
                elif fault in ('version','length','count','title','roster','reserved'):
                    struct.pack_into('<H',raw,{'version':4,'length':6,'count':8,'title':10,'roster':12,'reserved':14}[fault],65535)
                elif fault=='name':raw[16]^=1
                elif fault=='padding':raw[31]=65
            return
        if ax >> 8 == 0x4d and self.names_fault=='child' and self.children[-1][1].startswith(' /W '):
            uc.reg_write(x86.UC_X86_REG_AX,1);return
        return super().interrupt(uc,num,arg)


def machine(image,p,fault=None):
    old=completed_machine(image,p)
    m=NamesMachine(image,{k:bytes(v) for k,v in old.files.items()},p)
    from tools.test_secret_continuation_io import BASE
    m.uc.mem_write(BASE,bytes(old.uc.mem_read(BASE,65536)))
    m.directories=set(old.directories);m.cwd=old.cwd;m.children=list(old.children)
    m.metric_inputs=[];m.metric_values=[];m.metric_fault=None
    m.names_inputs=[];m.names_fault=fault
    return m


@pytest.mark.parametrize('fault',['read','close','seek','delete','child','absent','stale','short','extra','magic','version','length','count','title','roster','reserved','name','padding'])
def test_foreign_names_reply_never_advances_party_or_authority(image,prepared,fault):
    m=machine(image,prepared,fault)
    m.files['C:\\WORK\\W.GWN']=bytearray(b'old foreign names')
    authority,party=bytes(m.files[prepared.paths[8]]),bytes(m.files[prepared.paths[1]])
    assert m.call('kn_resume')
    assert bytes(m.files[prepared.paths[8]])==authority and bytes(m.files[prepared.paths[1]])==party
    assert not any(path.endswith('CCFLOW.COM') for path,tail in m.children)
    if fault!='delete':assert len(m.names_inputs)==1
    assert all(handle[0]==prepared.paths[8] for handle in m.handles.values())
    close_source(m)


@pytest.mark.parametrize('context',[Context(),Context(1,z=65535)])
def test_names_always_refresh_even_when_explicit_strength_bypasses_metric(image,prepared,context):
    p=replace(prepared,context=context)
    m=machine(image,p)
    assert not m.call('kn_resume')
    assert len(m.names_inputs)==1
    assert ' /B W.GWN' in m.children[-1][1]
    assert decode(bytes(m.files[p.paths[8]])).context==context
    close_source(m);before=len(m.names_inputs)
    assert not m.call('kn_resume') and len(m.names_inputs)==before


@pytest.mark.parametrize('name',['W.GWN','O.EFX','O.GBS','O.GBT','O.GBP','A.OUT','OUTCOME.OUT','OUTPUT.EFX','OUTPUT.GBS','OUTPUT.GBT','OUTPUT.GBP'])
def test_new_and_legacy_work_aliases_cannot_be_response_authority(image,prepared,name):
    m=machine(image,prepared)
    m.put('kn_response',('C:\\WORK\\'+name).encode()+b'\0')
    before={k:bytes(v) for k,v in m.files.items()};children=len(m.children)
    assert m.call('kn_resume')
    assert {k:bytes(v) for k,v in m.files.items()}==before and len(m.children)==children


from tools.test_secret_who_names import image as party_image,Machine as PartyMachine,parse as party_parse
class ActualPartyNamesMachine(NamesMachine):
    party_binary=None
    def interrupt(self,uc,num,arg):
        from tools.test_secret_continuation_io import x86
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        is_query=False
        if ax==0x4b00:
            raw=self.get('kn_tail',128);tail=raw[1:1+raw[0]].decode()
            is_query=tail.startswith(' /W ')
        super().interrupt(uc,num,arg)
        if is_query:
            option,source,reply=tail.split()
            worker=PartyMachine(self.party_binary,{source:bytes(self.files[source])})
            party_parse(worker,option+' '+source+' '+reply)
            assert not worker.call('wn_query')
            self.files[reply]=bytearray(worker.files[reply])
            assert not worker.handles and bytes(worker.files[source])==bytes(self.files[source])


@pytest.mark.parametrize('explicit_z',[False,True])
def test_actual_compiled_cpparty_pascal_reply_is_admitted_by_compiled_ccnext(image,party_image,prepared,explicit_z):
    p=replace(prepared,context=Context(1,z=65535) if explicit_z else Context())
    old=completed_machine(image,p)
    m=ActualPartyNamesMachine(image,{k:bytes(v) for k,v in old.files.items()},p)
    from tools.test_secret_continuation_io import BASE
    m.uc.mem_write(BASE,bytes(old.uc.mem_read(BASE,65536)))
    m.directories=set(old.directories);m.cwd=old.cwd;m.children=list(old.children)
    m.metric_inputs=[];m.metric_values=[];m.metric_fault=None
    m.names_inputs=[];m.names_fault=None;m.party_binary=party_image
    assert not m.call('kn_resume')
    assert m.files['C:\\WORK\\W.GWN'][16]==prepared.part('roster')[17]
    assert m.files['C:\\WORK\\W.GWN'][17]==prepared.part('roster')[18]
    assert decode(bytes(m.files[p.paths[8]])).context==p.context
