"""Opt-in ENTRY serializer over disposable simulated DOS sources only."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest
from tools.test_secret_reward_entry import (
    entry_record,commit_owner_base,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,owner_base)
from tools.secret_reward import decode as decode_reward
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,x86

EXPORTS=("rw_write","rw_close","rw_header","rw_paths","rw_context","rw_specs","rw_fh",
         "ep_paths","ep_lengths","ep_descriptor","ep_fh","output","source0","source1",
         "source2","memory","stacktop","kc_fh","kc_extent","kc_view_active",
         "rr_index","rr_read_at","rr_header","rr_error","kc_close","kc_cmp","rw_buf","ep_read",
         "kn_peer_fh",
         "ep_compare","ec_part","ec_offsets","ec_lengths","ec_index","ec_mode",
         "ec_bank","ec_source","ec_left","ec_destination","ec_chunk","ec_cursor")


@pytest.fixture(scope="module")
def serializer_image(tmp_path_factory):
    folder=tmp_path_factory.mktemp("entry-serialize-only")
    asm=folder/"probe.asm";binary=asm.with_suffix(".bin")
    asm.write_text("%define RW_SECTION_PROVIDER ep_read\n%define RW_SECTION_BOUND ep_span\n"
                   "cpu 386\nbits 16\norg 100h\ndw "+",".join(EXPORTS)+'''
%include "secretcontinuation_io.inc"
%include "secretreward_record.inc"
%include "secretreward_write_probe.inc"
%include "secretreward_entry_source.inc"
%include "secretreward_entry_compare.inc"
output db 'C:\\PRIVATE\\ENTRY.GRT',0
source0 db 'C:\\PRIVATE\\ORIGIN.GSK',0
source1 db 'C:\\PRIVATE\\ANSWER.BIN',0
source2 db 'D:\\ITEM.GLB',0
kn_peer_fh dw 0ffffh
memory times 4096 db 0
times 512 db 0
stacktop:
''')
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    probe=Path(__file__).resolve().parent/"native-probes"
    run=subprocess.run([nasm,"-I",str(probe)+"/","-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes();assert len(raw)+256<=65280
    labels=dict(zip(EXPORTS,struct.unpack_from("<"+"H"*len(EXPORTS),raw)))
    assert labels["stacktop"]==len(raw)+256 and raw[-512:]==bytes(512)
    return raw,labels


def call(m,label,**registers):
    top=m.labels["stacktop"]
    for name,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":top-2,
                       "FS":0x4000,"GS":0x5000,"EFLAGS":2,**registers}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    m.uc.mem_write(BASE+top-2,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels[label],BASE+0xff00,count=10000000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00 and m.uc.reg_read(x86.UC_X86_REG_SP)==top
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


def configured(compiled,base,**faults):
    expected,_=entry_record(base);record=decode_reward(expected)
    paths=(r"C:\PRIVATE\ORIGIN.GSK",r"C:\PRIVATE\ANSWER.BIN",r"D:\ITEM.GLB")
    files=dict(zip(paths,(record.sections[0],record.sections[1],record.sections[4][32:])))
    m=RewardDiskMachine(compiled,files,**faults)
    m.put("rw_header",record.header);m.put("rw_paths",record.paths);m.put("rw_context",record.context)
    m.put("ep_paths",struct.pack("<3H",*(m.labels["source"+str(i)] for i in range(3))))
    m.put("ep_lengths",struct.pack("<3I",*(len(files[path]) for path in paths)))
    m.put("ep_descriptor",record.sections[4][:32])
    specs=bytearray();cursor=m.labels["memory"]
    for index,part in enumerate(record.sections):
        if not part: specs+=bytes(12)
        elif index in (0,1,4): specs+=struct.pack("<HHII",3,{0:0,1:1,4:2}[index],0,len(part))
        elif index in (6,7):
            m.uc.mem_write(0x40000,part);specs+=struct.pack("<HHII",2,0x4000,0,len(part))
        elif index%2 and index in (9,11,13):
            prior=struct.unpack_from("<HHII",specs,(index-1)*12)
            specs+=struct.pack("<HHII",*prior)
        else:
            assert cursor+len(part)<=m.labels["memory"]+4096
            m.uc.mem_write(BASE+cursor,part)
            specs+=struct.pack("<HHII",2,BASE>>4,cursor,len(part));cursor+=len(part)
    m.put("rw_specs",bytes(specs))
    return m,expected,files


def test_opt_in_writer_serializes_exact_genuine_entry_wire(serializer_image,commit_owner_base):
    m,expected,files=configured(serializer_image,commit_owner_base)
    assert len(files[r"C:\PRIVATE\ORIGIN.GSK"])>65536
    assert not call(m,"rw_write",DX=m.labels["output"])
    assert m.disk_snapshot()=={**files,r"C:\PRIVATE\ENTRY.GRT":expected}
    assert not m.handles and m.get("ep_fh",2)==m.get("rw_fh",2)==b"\xff\xff"
    assert not any(e["ax"]>>8 in (0x41,0x56) for e in m.events)


def compare(m):
    """Run the private native exact comparator; it grants no game authority."""
    if struct.unpack("<H",m.get("ep_fh",2))[0]!=65535: return "io"
    if call(m,"ep_compare",DX=m.labels["output"]):
        return "io" if m.get("kc_fh",2)!=b"\xff\xff" else "different"
    return "equal"


def test_exact_comparison_reads_multiple_sources_and_memory_paths(serializer_image,commit_owner_base):
    m,expected,files=configured(serializer_image,commit_owner_base)
    assert not call(m,"rw_write",DX=m.labels["output"])
    before=m.disk_snapshot();mutations=m.mutations
    assert compare(m)=="equal"
    assert m.disk_snapshot()==before and m.mutations==mutations and not m.handles


@pytest.mark.parametrize("where",["header","paths","context","origin","answer","descriptor","member",
    "archive-first","archive-last","p1-pre","p1-post","state-pre","state-post",
    "items-pre","items-post","ledger-pre","ledger-post","request","trailing","short"])
def test_corruption_never_matches_or_mutates_candidate(serializer_image,commit_owner_base,where):
    m,expected,_=configured(serializer_image,commit_owner_base)
    assert not call(m,"rw_write",DX=m.labels["output"])
    path=r"C:\PRIVATE\ENTRY.GRT";raw=bytearray(m.files[path])
    offsets={"header":32,"paths":260,"context":1496}
    indexes={"origin":0,"answer":1,"descriptor":4,"archive-first":4,"archive-last":4,
             "member":5,"p1-pre":6,"p1-post":7,"state-pre":8,"state-post":9,
             "items-pre":10,"items-post":11,"ledger-pre":12,"ledger-post":13,"request":14}
    if where in indexes:
        start,length=struct.unpack_from("<II",raw,128+indexes[where]*8)
        offsets[where]=start+(32 if where=="archive-first" else length-1 if where=="archive-last" else 0)
    if where=="trailing": raw+=b"\0"
    elif where=="short": del raw[-1]
    else: raw[offsets[where]]^=1
    m.files[path]=raw;before=m.disk_snapshot();mutations=m.mutations
    assert compare(m)=="different"
    assert m.disk_snapshot()==before and m.mutations==mutations and not m.handles
