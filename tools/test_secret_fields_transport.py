"""Compiled GBWN3/GBSF2 producer and both current query consumers."""
from dataclasses import replace
import struct,pytest
from tools.test_secret_who_names import image as party_image,Machine as PartyMachine,parse,names_packet
from tools.test_secret_native_strength_query import roster
from tools.test_secret_player_stats import inputs
from tools.secret_roster import encode
from tools.test_secret_continuation import prepared
from tools.test_secret_continuation_coordinator import image as coordinator_image,close_source
from tools.test_secret_continuation_names import NamesMachine,machine as names_machine
from tools.test_secret_v16_transport import images,Machine as BootMachine,names_machine as boot_machine
from tools.test_secret_continuation_io import x86

FAULTS=['magic','version','extent','count','fieldcount','flags','reserved','unsigned19','unsigned25','unsigned27','signed107','signed108','unsigned112','unsigned245','last_unsigned','last_signed','trailing','truncated','old-v2','old-v1']
def mutate(raw,fault):
    count=struct.unpack_from('<H',raw,8)[0];base=16+16*count
    if fault=='truncated':del raw[-1:];return
    if fault in ('old-v2','old-v1'):
        names=bytes(raw[16:base]);rows=b''.join(bytes(raw[base+16+i*14:base+16+i*14+12]) for i in range(count))
        version=2 if fault=='old-v2' else 1
        raw[:]=struct.pack('<4s6H',b'GBWN',version,32+28*count if version==2 else base,count,4,struct.unpack_from('<H',raw,12)[0],0)+names
        if version==2:raw+=struct.pack('<4s6H',b'GBSF',1,16+12*count,count,6,0,0)+rows
        return
    if fault=='trailing':raw+=b'X';return
    if fault=='magic':raw[base:base+4]=b'FAIL';return
    if fault in ('version','extent','count','fieldcount','flags','reserved'):
        struct.pack_into('<H',raw,base+{'version':4,'extent':6,'count':8,'fieldcount':10,'flags':12,'reserved':14}[fault],65535);return
    row=base+16
    if fault.startswith('last'):row+=(count-1)*14
    slot={'unsigned19':0,'unsigned25':1,'unsigned27':2,'signed107':3,'signed108':4,'unsigned112':5,'unsigned245':6,'last_unsigned':6,'last_signed':4}[fault]
    struct.pack_into('<H',raw,row+2*slot,128 if 'signed' in fault and 'unsigned' not in fault else 256)

class FieldNames(NamesMachine):
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        tail=self.get('kn_tail',128);tail=tail[1:1+tail[0]].decode() if ax==0x4b00 else ''
        super().interrupt(uc,num,arg)
        if tail.startswith(' /W '):mutate(self.files[tail.split()[2]],self.field_fault)

class FieldBoot(BootMachine):
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        super().interrupt(uc,num,arg)
        if ax==0x4b00:mutate(self.files['C:\\_GBWHO.GWN'],self.field_fault)

@pytest.mark.parametrize('fault',FAULTS)
def test_both_consumers_reject_closed_field_schema_and_noncanonical_words(coordinator_image,images,prepared,fault):
    old=names_machine(coordinator_image,prepared)
    m=FieldNames(coordinator_image,{k:bytes(v) for k,v in old.files.items()},prepared)
    from tools.test_secret_continuation_io import BASE
    m.uc.mem_write(BASE,bytes(old.uc.mem_read(BASE,65536)));m.directories=set(old.directories);m.cwd=old.cwd;m.children=list(old.children)
    m.metric_inputs=[];m.metric_values=[];m.metric_fault=None;m.names_inputs=[];m.names_fault=None;m.field_fault=fault
    authority=bytes(m.files[prepared.paths[8]]);party=bytes(m.files[prepared.paths[1]])
    assert m.call('kn_resume') and bytes(m.files[prepared.paths[8]])==authority and bytes(m.files[prepared.paths[1]])==party
    assert not any(p.endswith('CCFLOW.COM') for p,t in m.children);close_source(m)
    base=boot_machine(images,prepared);b=FieldBoot(images['boot'],{k:bytes(v) for k,v in base.files.items()})
    b.uc.mem_write(BASE,bytes(base.uc.mem_read(BASE,65536)));b.field_fault=fault
    assert b.call('secret_names_refresh') and b.get('secret_names_valid',1)==b'\0'
    assert bytes(b.files['C:\\PARTY.GBP'])==prepared.part('roster') and not b.handles

@pytest.mark.parametrize('count',[1,3,6])
def test_actual_projected_field_rows_follow_owned_actor_order(party_image,roster,count):
    order=(5,2,6,1,4,3)[:count];owned=replace(roster,heroes=tuple(roster.heroes[i-1] for i in order));raw=encode(owned)
    m=PartyMachine(party_image,{'C:\\P1.GBP':raw});parse(m,'/W C:\\P1.GBP C:\\W.GWN');assert not m.call('wn_query')
    response=bytes(m.files['C:\\W.GWN']);assert response==names_packet(owned)
    assert struct.unpack_from('<4s6H',response,16+16*count)==(b'GBSF',2,16+14*count,count,7,0,0)
    assert bytes(m.files['C:\\P1.GBP'])==raw and not m.handles

@pytest.mark.parametrize('signed108',[127,128,255])
def test_writer_signextends_projected_actor108(party_image,roster,signed108):
    h=roster.heroes[0];body=bytearray(h.body);body[108]=signed108;owned=replace(roster,heroes=(replace(h,body=bytes(body)),))
    raw=encode(owned);m=PartyMachine(party_image,{'C:\\P1.GBP':raw});parse(m,'/W C:\\P1.GBP C:\\W.GWN');assert not m.call('wn_query')
    response=bytes(m.files['C:\\W.GWN']);assert response==names_packet(owned)
    expected=signed108 if signed108<128 else signed108-256
    assert struct.unpack_from('<h',response,16+16+16+8)==(expected,)
    assert bytes(m.files['C:\\P1.GBP'])==raw


@pytest.mark.parametrize('value',[0,70,128,255])
def test_writer_trap_field_zeroextends_current_actor245(party_image,roster,value):
    h=roster.heroes[3];body=bytearray(h.body);body[245]=value
    owned=replace(roster,heroes=(replace(h,body=bytes(body)),))
    raw=encode(owned);m=PartyMachine(party_image,{'C:\\P1.GBP':raw});parse(m,'/W C:\\P1.GBP C:\\W.GWN')
    assert not m.call('wn_query')
    response=bytes(m.files['C:\\W.GWN']);assert response==names_packet(owned)
    assert struct.unpack_from('<H',response,48+12)==(value,)
    assert bytes(m.files['C:\\P1.GBP'])==raw and not m.handles


def test_each_new_query_uses_current_projected_maximum_hp_without_actor_write(party_image,roster):
    h=roster.heroes[0];original=replace(roster,heroes=(h,));body=bytearray(h.body);body[112]=126;body[437]=0
    changed=replace(roster,heroes=(replace(h,body=bytes(body)),));responses=[]
    for owned in (original,changed):
        raw=encode(owned);m=PartyMachine(party_image,{'C:\\P1.GBP':raw});parse(m,'/W C:\\P1.GBP C:\\W.GWN');assert not m.call('wn_query')
        response=bytes(m.files['C:\\W.GWN']);assert response==names_packet(owned);responses.append(struct.unpack_from('<H',response,16+16+16+10)[0])
        assert bytes(m.files['C:\\P1.GBP'])==raw
    assert responses==[h.body[112],126]


def test_actual_worker_fields_match_all_original_loaded_actor_getters(party_image,roster,inputs):
    from tools.secret_player_oracle import PlayerMachine
    from tools.secret_selected_field_oracle import ORIGINAL_FIELDS as FIELDS,SelectedFieldMachine
    retail,files=inputs
    bodies=tuple(PlayerMachine(retail,files).load_player(f'CHRDATA{i}.SAV').body for i in range(1,7))
    raw=encode(roster);m=PartyMachine(party_image,{'C:\\P1.GBP':raw});parse(m,'/W C:\\P1.GBP C:\\W.GWN');assert not m.call('wn_query')
    packet=bytes(m.files['C:\\W.GWN']);base=16+16*6+16
    for actor in range(6):
        words=struct.unpack_from('<7H',packet,base+actor*14)
        for index,selector in enumerate(FIELDS):
            actual=SelectedFieldMachine(retail).read_field(bodies,selector,selected=actor)
            assert words[index]==actual.value,(actor,selector,words[index],actual.value)
    assert bytes(m.files['C:\\P1.GBP'])==raw and not m.handles
