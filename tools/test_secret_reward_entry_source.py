"""Private multi-file source reader over disposable simulated DOS files."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,x86

EXPORTS=("ep_read","ep_close","ep_fh","ep_paths","ep_lengths","ep_descriptor",
         "ep_storage","ep_end","below","above","path0","path1","path2",
         "kc_fh","kc_extent","kc_view_active","kc_view_base","kc_view_parent_extent",
         "kc_verified","stacktop")


@pytest.fixture(scope="module")
def provider_image(tmp_path_factory):
    folder=tmp_path_factory.mktemp("entry-source")
    asm=folder/"probe.asm";binary=asm.with_suffix(".bin")
    asm.write_text("cpu 386\nbits 16\norg 100h\ndw "+",".join(EXPORTS)+'''
below times 512 db 0
%include "secretcontinuation_io.inc"
%include "secretreward_entry_source.inc"
above times 512 db 0
path0 db 'C:\\ORIGIN.GSK',0
path1 db 'C:\\ANSWER.BIN',0
path2 db 'D:\\ITEM.GLB',0
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


def machine(compiled,length=65537,**faults):
    archive=bytes((i*17+3)%256 for i in range(length))
    files={r"C:\ORIGIN.GSK":b"origin"*12000,r"C:\ANSWER.BIN":b"GBMO"+bytes(14),r"D:\ITEM.GLB":archive}
    m=RewardDiskMachine(compiled,files,**faults)
    m.put("ep_paths",struct.pack("<3H",*(m.labels["path"+str(i)] for i in range(3))))
    m.put("ep_lengths",struct.pack("<3I",*(len(body) for body in files.values())))
    m.put("ep_descriptor",b"GBRI"+bytes(range(28)))
    # Actual open parent file and active nested window are independent of the
    # provider's logical source files, and must survive every read/error.
    parent=r"C:\PARENT.BIN";m.files[parent]=bytearray(b"parent-window")
    fd=m.open_other(parent)
    m.put("kc_fh",struct.pack("<H",fd));m.put("kc_extent",struct.pack("<I",7))
    m.put("kc_view_active",b"\1");m.put("kc_view_base",struct.pack("<I",3))
    m.put("kc_view_parent_extent",struct.pack("<I",13));m.put("kc_verified",b"\1\0")
    return m,b"GBRI"+bytes(range(28))+archive


def parent_state(m):
    return {name:m.get(name,size) for name,size in (("kc_fh",2),("kc_extent",4),("kc_view_active",1),
            ("kc_view_base",4),("kc_view_parent_extent",4),("kc_verified",2))}


def read(m,offset,count,buffer="above",selector=2):
    top=m.labels["stacktop"]
    for name,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":top-2,
                       "EFLAGS":2,"FS":0x4000,"GS":0x5000,"EAX":offset,"BX":selector,
                       "CX":count,"DI":m.labels[buffer]}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    m.uc.mem_write(BASE+top-2,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels["ep_read"],BASE+0xff00,count=100000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00 and m.uc.reg_read(x86.UC_X86_REG_SP)==top
    assert m.uc.reg_read(x86.UC_X86_REG_FS)==0x4000 and m.uc.reg_read(x86.UC_X86_REG_GS)==0x5000
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


@pytest.mark.parametrize("buffer",["below","above"])
@pytest.mark.parametrize("offset",[0,31,32,33,65535,65536])
def test_prefix_and_large_offsets_preserve_parent_window(provider_image,buffer,offset):
    m,logical=machine(provider_image,66000)
    saved=parent_state(m);files=m.disk_snapshot();handles=dict(m.handles)
    assert not read(m,offset,128,buffer)
    assert m.get(buffer,128)==logical[offset:offset+128]
    assert parent_state(m)==saved and m.handles==handles
    assert m.disk_snapshot()==files and not m.mutations


@pytest.mark.parametrize("length",[65535,65536,65537])
def test_exact_final_chunk_and_eof_bound(provider_image,length):
    m,logical=machine(provider_image,length)
    assert not read(m,len(logical)-1,1)
    assert m.get("above",1)==logical[-1:]
    count=len(m.events)
    assert read(m,len(logical),1)
    assert len(m.events)==count


def test_provider_control_overlap_refuses_before_dos(provider_image):
    m,_=machine(provider_image)
    saved=m.get("ep_storage",m.labels["ep_end"]-m.labels["ep_storage"])
    assert read(m,32,64,"ep_storage") and not m.events
    assert m.get("ep_storage",len(saved))==saved


@pytest.mark.parametrize("call,effect",[(1,"error"),(2,"error"),(3,"error"),(3,"bad-position"),(4,"error"),(4,"short"),(5,"error")])
def test_file_faults_preserve_parent_and_retained_close(provider_image,call,effect):
    m,_=machine(provider_image,fault_at=call,fault=effect)
    saved=parent_state(m);files=m.disk_snapshot()
    assert read(m,33,128)
    assert parent_state(m)==saved and m.disk_snapshot()==files and not m.mutations
    if call==5:
        fd=struct.unpack("<H",m.get("ep_fh",2))[0]
        assert fd in m.handles and m.handles[fd][0]==r"D:\ITEM.GLB"
        count=len(m.events);assert read(m,32,1) and len(m.events)==count
    else: assert m.get("ep_fh",2)==b"\xff\xff"
