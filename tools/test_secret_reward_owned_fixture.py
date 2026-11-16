"""Portable source-bound ordinary native opening, not a seven-asset/fullboot proof.

Actual held inputs are pinned/read-only. CPPARTY imports and queries them;
CCFLOW/CCECL produce each cursor; CCNEXT owns its INITIAL/menu transitions.
No original guest, direct PC assignment, captured temp files, fake GBKO or
public GSK4 authority is used. Only DOS transport is emulated.
"""
from dataclasses import dataclass
import hashlib
import struct
from pathlib import Path

import pytest
from tools.test_secret_reward_capture import image,ActualCoordinator
from tools.test_secret_narration_native import consumers,producer_image,PipelineMachine
from tools.test_secret_who_names import image as party_image,Machine as PartyMachine
from tools.test_secret_continuation import prepared,inputs,with_part
from tools.test_secret_initial_cursor import initial,setup_initial
from tools.test_secret_continuation_coordinator import public_run
from tools.test_secret_print import AMIGA,SOURCE_SHA
from tools.test_secret_continuation_io import BASE,x86
from tools.secret_continuation import encode,decode,Phase,check_menu_outcome,source_member
from tools.secret_roster import decode as decode_roster
from tools.test_secret_player_stats import DEFAULT_ROOT,PLAYER_HASHES
from tools.secret_melee_oracle import HASHES as ORACLE_HASHES


@dataclass(frozen=True)
class OwnedRewardFixture:
    origin: object
    answer: bytes
    completed: object
    producer: object
    origin_bytes: bytes
    completed_bytes: bytes
    producer_bytes: bytes
    party: bytes
    context: object
    source: bytes
    files: dict
    directories: frozenset
    image: object
    consumers: object
    producer_image: object
    party_image: object
    checkpoints: tuple
    commands: tuple
    source_pins: tuple


class ImportPartyTransport(PartyMachine):
    """Supply normal stdout DOS service; all importer instructions still run."""
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if number==0x21 and ax>>8==0x40 and uc.reg_read(x86.UC_X86_REG_BX)==1:
            size=uc.reg_read(x86.UC_X86_REG_CX)
            address=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)
            self.stdout=getattr(self,'stdout',b'')+bytes(uc.mem_read(address,size))
            uc.reg_write(x86.UC_X86_REG_AX,size)
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
            return
        return super().interrupt(uc,number,unused)


def run_party(party_image,files,command):
    m=ImportPartyTransport(party_image,files);m.exit_code=None
    raw=command.encode('ascii');assert len(raw)<=127
    m.uc.mem_write(BASE+0x80,bytes((len(raw),))+raw+b'\r')
    m.call('start')
    assert m.exit_code==0,(command,m.events[-12:])
    assert not m.handles
    return {p:bytes(b) for p,b in m.files.items()}


def menu_answer(current):
    effect=current.part('paused') if current.phase==Phase.PREPARED else current.part('successor')
    assert struct.unpack_from('<H',effect,8)[0]==2
    assert effect[5750:5754]==b'GBMN'
    count=struct.unpack_from('<H',effect,5758)[0]
    identity=struct.unpack_from('<4H',effect,5766)
    # The actual admitted horizontal menu exposes exactly one ordinary choice.
    assert count==1 and identity[3]==0x2b
    answer=struct.pack('<4s7H',b'GBMO',2,0,count,*identity)
    check_menu_outcome(effect,answer)
    return answer


@pytest.fixture(scope='module')
def owned_reward_fixture(image,prepared,inputs,consumers,producer_image,party_image):
    retail,held=inputs
    source=AMIGA.read_bytes();assert hashlib.sha256(source).hexdigest()==SOURCE_SHA
    catalogue=AMIGA.parent.parent/'DISK1'/'ITEMS.DAT'
    catalogue_bytes=catalogue.read_bytes()
    assert catalogue_bytes==retail.definitions
    pin_paths=[AMIGA,catalogue]+[DEFAULT_ROOT/f'CHRDATA{i}.{ext}' for i in range(1,7) for ext in ('SAV','SFX','STF')]+[DEFAULT_ROOT/name for name in ORACLE_HASHES]
    def pin(path):
        if not path.exists(): return (str(path),None,None,None)
        raw=path.read_bytes();return (str(path),hashlib.sha256(raw).hexdigest(),len(raw),path.stat().st_mtime_ns)
    source_pins=tuple(pin(path) for path in pin_paths)
    expected_hashes={**ORACLE_HASHES,**PLAYER_HASHES}
    for path,digest,size,mtime in source_pins:
        if Path(path).name in expected_hashes:
            assert digest==expected_hashes[Path(path).name]
    # Actual /S import, not a Python-created authority. Relative names are the
    # importer's normal DOS input names; virtual originals remain read-only.
    files={name:bytes(raw) for name,raw in held.items()}
    files['ITEMS.DAT']=catalogue_bytes
    originals=dict(files)
    files=run_party(party_image,files,' /S C:\\PARTY.GBP')
    assert all(files[name]==raw for name,raw in originals.items())
    party=files['C:\\PARTY.GBP'];decode_roster(party)
    assert party==prepared.part('roster')
    files=run_party(party_image,files,' /W C:\\PARTY.GBP C:\\N.GWN')
    names=files['C:\\N.GWN'];assert names[:6]==b'GBWN\3\0'
    files['C:\\TEXT.GLB']=source
    flow=PipelineMachine(consumers['flow'],producer_image,files)
    command=' C:\\TEXT.GLB 16 /ID4 /B C:\\N.GWN /9 1 /! /E C:\\TEXT.EFX'
    raw=command.encode();flow.uc.mem_write(BASE+0x80,bytes((len(raw),))+raw+b'\r')
    flow.call('start')
    assert flow.exit==0 and flow.children,(flow.messages,flow.events[-15:])
    effect=bytes(flow.files['C:\\TEXT.EFX']);stream=bytes(flow.files['C:\\TEXT.GBS'])
    # Standard INITIAL descriptor follows the actual produced cursor. Native
    # kn_prepare performs its normal absence/source/party/stream admission and
    # creates the first owned GSK; no host ACTIVE/GBKO is substituted.
    p=initial(prepared)
    p=with_part(p,'roster',party);p=with_part(p,'paused',effect);p=with_part(p,'stream',stream)
    identity=struct.pack('<4s2H2I',b'GBID',1,16,len(source),0)+source
    p=with_part(p,'identity',identity)
    base=setup_initial(image,p)
    m=ActualCoordinator(image,{name:bytes(body) for name,body in base.files.items()},p,
                        consumers=consumers,producer=producer_image,party=party_image)
    m.directories=base.directories.copy()
    for label,path in (('kn_expected_roster',p.paths[1]),('kn_expected_source',p.paths[0]),
                       ('kn_response','C:\\NEXT.BIN'),('kn_prefix','C:\\')):
        m.put(label,path.encode()+b'\0')
    assert not m.call('kn_names')
    commands=['CCPARTY /S C:\\PARTY.GBP','CCPARTY /W C:\\PARTY.GBP C:\\N.GWN',command]
    checkpoints=[]
    for ordinal in range(4):
        current_bytes=bytes(m.files[p.paths[8]]);current=decode(current_bytes)
        answer=menu_answer(current)
        checkpoints.append((current_bytes,answer))
        assert struct.unpack_from('<4H',answer,10)==(6940,16,32642,0x2b)
        print('admitted menu',ordinal,struct.unpack_from('<4H',answer,10))
        m.files[p.paths[6]]=bytearray(answer)
        tail=' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN'
        commands.append('CCNEXT'+tail)
        result=public_run(m,image,tail)
        admitted_post=decode(bytes(m.files[p.paths[8]]))
        whole_receipt=admitted_post.part('receipt')
        receipt_extent=struct.unpack_from('<I',whole_receipt,8)[0]
        receipt_input=decode(whole_receipt[24:24+receipt_extent])
        assert receipt_input.phase==Phase.COMPLETED
        assert receipt_input.part('outcome')==answer
        assert receipt_input.part('roster')==current.part('roster')
        print('native menu result',ordinal,result,m.failures)
        assert result==(1 if ordinal==3 else 2),(ordinal,result,m.failures,m.events[-18:])
        if result==1:
            origin=current;origin_bytes=current_bytes;equipment_answer=answer
            assert origin.phase==Phase.ACTIVE and origin.resume_kind==1
            break
        assert result==2,(ordinal,result,m.failures,m.events[-18:])
    else:
        pytest.fail('actual ordinary route did not reach paused27 within four admitted menus')
    producer_bytes=bytes(m.files[p.paths[8]]);producer=decode(producer_bytes)
    effect=producer.part('successor')
    assert producer.phase==Phase.ACTIVE and producer.resume_kind==1
    assert struct.unpack_from('<3H',effect,120)==(13,16,605)
    assert struct.unpack_from('<H',effect,8)[0]==3 and not struct.unpack_from('<H',effect,32)[0]
    receipt=producer.part('receipt');extent=struct.unpack_from('<I',receipt,8)[0]
    completed_bytes=receipt[24:24+extent];completed=decode(completed_bytes)
    assert completed.phase==Phase.COMPLETED and completed.resume_kind==1
    assert completed.part('outcome')==equipment_answer
    assert completed.part('roster')==origin.part('roster')==party
    assert producer.part('roster')==party
    assert source_member(source,16)[0x24b:0x25c]==bytes.fromhex('2700000000000000000000001400000012')
    assert not any(path.endswith('CCHOST.COM') for path,tail in m.children)
    assert len(m.productions)==len(checkpoints) and all(len(children)>=1 for children in m.productions)
    assert p.paths[9]+'\\OWNER.BIN' in m.files
    assert tuple(pin(path) for path in pin_paths)==source_pins
    return OwnedRewardFixture(origin,equipment_answer,completed,producer,origin_bytes,
        completed_bytes,producer_bytes,party,origin.context,source,
        {name:bytes(body) for name,body in m.files.items()},frozenset(m.directories),
        image,consumers,producer_image,party_image,tuple(checkpoints),tuple(commands),tuple(source_pins))


def test_portable_ordinary_owned_reward_boundary(owned_reward_fixture):
    f=owned_reward_fixture
    assert len(f.answer)==18 and len(f.party)<=32768
    assert f.origin.part('roster')==f.completed.part('roster')==f.producer.part('roster')
    assert f.completed.part('outcome')==f.answer
    print(f'ordinary native owned fixture: origin={len(f.origin_bytes)} completed={len(f.completed_bytes)} active-paused27={len(f.producer_bytes)} P1={len(f.party)}; all menus/source/receipt derived')
