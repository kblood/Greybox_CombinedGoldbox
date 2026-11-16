"""Raw two-image byte classification only, not GRJ/game semantic admission."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE, x86

EXPORTS = ("rpeer_match_p1", "kc_open", "kc_close", "kc_verified", "kc_fh", "kc_extent",
           "kc_view_active", "kn_peer_fh", "kn_peer_close", "kn_peer_exact", "kn_bank_compare",
           "kn_normalize", "rr_offsets", "rr_lengths", "include_start", "include_end",
           "peer_path", "source_path")
SOURCE, PEER = "C:\\JOURNAL.GRJ", "D:\\PEER.GBP"


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    folder=tmp_path_factory.mktemp("reward-peer-private")
    asm,binary=folder/"peer.asm",folder/"peer.bin"
    asm.write_text("cpu 386\nbits 16\norg 100h\ndw "+",".join(EXPORTS)+'''
%include "ccnext.asm"
%include "secretreward_record.inc"
include_start:
%include "secretreward_peer.inc"
include_end:
peer_path db 'D:\\PEER.GBP',0
source_path db 'C:\\JOURNAL.GRJ',0
''',encoding="ascii")
    root=Path(__file__).resolve().parents[1]
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    if not Path(nasm).is_file() and not shutil.which(nasm): pytest.skip("NASM absent")
    run=subprocess.run([nasm,"-I",str(root/"native/src")+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from("<"+"H"*len(EXPORTS),raw)))


def body(length,seed=7):
    return bytes((seed+index*29+(index>>8)*17)&255 for index in range(length))


def machine(image,pre,post,peer,**kwargs):
    # Declared synthetic physical envelope lets this unit test isolate the
    # comparator; no fabricated rv-valid flag or positive authority is used.
    prefix=body(70019,31);middle=body(23,92)
    source=prefix+pre+middle+post+b"closed unrelated source suffix"
    files={SOURCE:source}
    if peer is not None: files[PEER]=peer
    m=RewardDiskMachine(image,files,**kwargs)
    assert not m.call("kc_open",DX=m.labels["source_path"])
    m.uc.mem_write(BASE+m.labels["rr_offsets"]+24,struct.pack("<2I",len(prefix),len(prefix)+len(pre)+len(middle)))
    m.uc.mem_write(BASE+m.labels["rr_lengths"]+24,struct.pack("<2I",len(pre),len(post)))
    return m


def inspect(m,expected_mask=None,*,error=False):
    before=m.disk_snapshot();source_handle=m.get("kc_fh",2);extent=m.get("kc_extent",4)
    m.put("kc_verified",b"\1\0");m.put("kn_peer_exact",b"\0")
    m.put("kn_bank_compare",b"\1");m.put("kn_normalize",b"\1")
    bad=m.call("rpeer_match_p1",DX=m.labels["peer_path"],FS=0x4000,GS=0x3000)
    mask=m.uc.reg_read(x86.UC_X86_REG_AX)
    assert bad==error
    assert mask==(0 if error else expected_mask)
    assert m.disk_snapshot()==before and m.get("kc_fh",2)==source_handle
    assert m.get("kc_extent",4)==extent and m.get("kc_verified",2)==bytes(2)
    assert m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_bank_compare",1)==m.get("kn_normalize",1)==bytes(1)
    for reg,value in (("DS",0x1000),("ES",0x1000),("FS",0x4000),("GS",0x3000)):
        assert m.uc.reg_read(getattr(x86,"UC_X86_REG_"+reg))==value
    assert not any(e.get("mutation") for e in m.events)
    assert not any(e["ax"]>>8 in (0x40,0x41,0x56,0x5b) for e in m.events)
    return mask


def close(m):
    m.fault_at=None
    if m.get("kn_peer_fh",2)!=b"\xff\xff": assert not m.call("kn_peer_close")
    assert not m.call("kc_close") and not m.handles


@pytest.mark.parametrize("length",[16,17,511,512,513,4813,32701,32768])
@pytest.mark.parametrize("selected",["pre","post","both","neither"])
def test_whole_equal_or_same_length_different_images(image,length,selected):
    pre=body(length);post=bytearray(pre);post[min(length-1,17+269)]^=3;post=bytes(post)
    if selected=="both": post=pre;peer=pre;mask=3
    elif selected=="pre": peer=pre;mask=1
    elif selected=="post": peer=post;mask=2
    else: peer=body(length,95);mask=0
    m=machine(image,pre,post,peer);inspect(m,mask)
    # Peer is streamed once, with one final zero-byte EOF check.
    peer_reads=[e for e in m.events if e["ax"]>>8==0x3f and e.get("path")==PEER]
    assert len(peer_reads)==(length+511)//512+1
    assert sum(e["result"] for e in peer_reads)==length
    close(m)


@pytest.mark.parametrize("pre_length,post_length",[(16,83),(511,578),(4813,4880),(32701,32768)])
@pytest.mark.parametrize("selected",[0,1])
def test_growth_and_variable_opaque_companion_tails(image,pre_length,post_length,selected):
    pre=body(pre_length);post=pre+body(post_length-pre_length,124)
    peer=(pre,post)[selected];m=machine(image,pre,post,peer)
    inspect(m,1<<selected);close(m)


@pytest.mark.parametrize("offset",[17+251,17+353,4813-1,32768-1])
def test_single_opaque_pointer_or_final_tail_byte_is_neither(image,offset):
    pre=body(32768);post=bytearray(pre);post[17+269]^=3
    peer=bytearray(pre);peer[offset]^=1
    m=machine(image,pre,bytes(post),bytes(peer));inspect(m,0);close(m)


@pytest.mark.parametrize("delta",[-4813,-1,1,67])
def test_wrong_complete_eof_is_mismatch_with_close_required(image,delta):
    pre=body(4813);post=body(4813,52);peer=body(4813+delta)
    m=machine(image,pre,post,peer);inspect(m,0)
    assert not any(e["ax"]>>8==0x3f and e.get("path")==PEER for e in m.events)
    close(m)


@pytest.mark.parametrize("case",["missing","access","missing-parent"])
def test_open_failure_never_becomes_neither(image,case):
    kwargs={}
    if case=="access":kwargs["denied_paths"]=(PEER,)
    if case=="missing-parent":kwargs["missing_parents"]=("D:",)
    m=machine(image,body(32),body(32,3),None if case=="missing" else body(32),**kwargs)
    inspect(m,error=True);assert m.get("kn_peer_fh",2)==b"\xff\xff";close(m)


def actual_calls(image,pre=None,post=None,peer=None):
    pre=body(1025) if pre is None else pre
    post=body(len(pre),42) if post is None else post
    peer=pre if peer is None else peer
    m=machine(image,pre,post,peer);inspect(m,int(peer==pre)+2*int(peer==post))
    events=list(m.events);close(m)
    return pre,post,peer,events


@pytest.mark.parametrize("matching",["pre","post","both"])
def test_every_actual_source_peer_seek_read_and_close_error_preserves_bytes(image,matching):
    pre,post=body(1025),body(1025,42)
    if matching=="both":post=pre
    peer=post if matching=="post" else pre
    pre,post,peer,events=actual_calls(image,pre,post,peer)
    selected=[e for e in events if e["index"]>=3 and e["ax"]>>8 in (0x3d,0x42,0x3f,0x3e)]
    assert any(e.get("path")==SOURCE and e["ax"]>>8==0x3f for e in selected)
    for e in selected:
        m=machine(image,pre,post,peer,fault_at=e["index"],error=5)
        inspect(m,error=True)
        if e["ax"]>>8==0x3e:
            fd=struct.unpack("<H",m.get("kn_peer_fh",2))[0]
            assert fd!=65535 and fd in m.handles and m.handles[fd][0]==PEER
            event_count=len(m.events);assert m.call("rpeer_match_p1",DX=m.labels["peer_path"])
            assert len(m.events)==event_count and struct.unpack("<H",m.get("kn_peer_fh",2))[0]==fd
        close(m)


def test_all_actual_reads_and_seek_returns_are_checked(image):
    pre,post,peer,events=actual_calls(image)
    for e in events:
        if e["index"]<3 or e["ax"]>>8 not in (0x42,0x3f):continue
        if e["ax"]>>8==0x3f and e["result"]==0:continue
        fault="bad-position" if e["ax"]>>8==0x42 else "short"
        m=machine(image,pre,post,peer,fault_at=e["index"],fault=fault)
        inspect(m,error=True);close(m)


def test_late_peer_io_after_both_masks_drop_is_failure(image):
    pre,post=body(1537),body(1537,11);peer=body(1537,85)
    m=machine(image,pre,post,peer);inspect(m,0)
    reads=[e for e in m.events if e["ax"]>>8==0x3f and e.get("path")==PEER]
    assert len(reads)==5;close(m)
    for e in reads[1:]:
        m=machine(image,pre,post,peer,fault_at=e["index"])
        inspect(m,error=True);close(m)


def test_wrong_eof_close_failure_retains_handle_and_blocks_reprobe(image):
    pre,post,peer=body(64),body(64,51),body(63)
    m=machine(image,pre,post,peer);inspect(m,0)
    event=next(e for e in m.events if e["ax"]>>8==0x3e);close(m)
    m=machine(image,pre,post,peer,fault_at=event["index"])
    inspect(m,error=True);fd=m.get("kn_peer_fh",2);events=len(m.events)
    assert fd!=b"\xff\xff" and struct.unpack("<H",fd)[0] in m.handles
    assert m.call("rpeer_match_p1",DX=m.labels["peer_path"])
    assert m.get("kn_peer_fh",2)==fd and len(m.events)==events
    close(m)


@pytest.mark.parametrize("case",["short-pre","large-post","overflow","outside-source","view","no-source","retained"])
def test_invalid_input_has_no_peer_io_and_never_closes_caller_handle(image,case):
    m=machine(image,body(64),body(64,21),body(64))
    if case=="short-pre":m.uc.mem_write(BASE+m.labels["rr_lengths"]+24,struct.pack("<I",15))
    elif case=="large-post":m.uc.mem_write(BASE+m.labels["rr_lengths"]+28,struct.pack("<I",32769))
    elif case=="overflow":m.uc.mem_write(BASE+m.labels["rr_offsets"]+24,struct.pack("<I",0xfffffff0))
    elif case=="outside-source":m.uc.mem_write(BASE+m.labels["rr_offsets"]+28,m.get("kc_extent",4))
    elif case=="view":m.put("kc_view_active",b"\1")
    elif case=="no-source":assert not m.call("kc_close")
    else:m.put("kn_peer_fh",struct.pack("<H",m.open_other(PEER)))
    handles={fd:list(row) for fd,row in m.handles.items()};events=len(m.events)
    inspect(m,error=True);assert len(m.events)==events and m.handles==handles
    m.put("kc_view_active",b"\0")
    if case=="no-source":assert not m.handles
    else:close(m)


def test_include_has_only_small_scalar_storage(image):
    _,labels=image
    print("rpeer emitted bytes",labels["include_end"]-labels["include_start"])
    assert labels["include_end"]-labels["include_start"]<600


def test_segment_precondition_failure_preserves_caller_segments_and_handles(image):
    m=machine(image,body(64),body(64,21),body(64))
    before=m.disk_snapshot();handles={fd:list(row) for fd,row in m.handles.items()};events=len(m.events)
    assert m.call("rpeer_match_p1",DX=m.labels["peer_path"],ES=0x2000,FS=0x4000,GS=0x3000)
    assert m.disk_snapshot()==before and m.handles==handles and len(m.events)==events
    assert m.uc.reg_read(x86.UC_X86_REG_ES)==0x2000
    assert m.uc.reg_read(x86.UC_X86_REG_DS)==0x1000
    assert m.uc.reg_read(x86.UC_X86_REG_FS)==0x4000 and m.uc.reg_read(x86.UC_X86_REG_GS)==0x3000
    assert m.get("kc_verified",2)==bytes(2)
    assert m.get("kn_peer_exact",1)==b"\1" and m.get("kn_bank_compare",1)==m.get("kn_normalize",1)==bytes(1)
    close(m)
