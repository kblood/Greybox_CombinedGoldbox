"""Private capture-capable caller preparation; missing-C protocol not yet implemented."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest
from tools.test_secret_reward_final import (
    final_image,final_capture,final_files,commit_owner_base,capture_image,
    recovery_image,commit_image,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,owner_base)
from tools.test_secret_reward_capture import ActualCoordinator
from tools.test_secret_continuation_coordinator import EXPORTS
from tools.secret_continuation import decode as decode_continuation
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,x86


def capture_invoke(m,paths):
    m.put("rc_test_inputs",b"".join(path.encode().ljust(112,b"\0") for path in paths))
    start=m.labels["rc_test_inputs"]
    stacktop=m.labels["stacktop"]
    stack_pointer=stacktop-2
    assert stacktop==m.labels["owned_end"]
    assert stacktop-512<=stack_pointer<stacktop
    segments={"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"FS":0x4000,"GS":0x5000}
    registers={**segments,"SP":stack_pointer,"EFLAGS":2,
               "DX":m.labels["owned_end"],"SI":start,"DI":start+112,
               "BX":start+224,"BP":start+336}
    for name,value in registers.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    m.uc.mem_write(BASE+stack_pointer,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels["rcommit_recover4"],BASE+0xff00,count=50000000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    assert m.uc.reg_read(x86.UC_X86_REG_SP)==stacktop
    for name,value in segments.items():
        assert m.uc.reg_read(getattr(x86,"UC_X86_REG_"+name))==value,name
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1),m.uc.reg_read(x86.UC_X86_REG_AX)


@pytest.fixture(scope="module")
def capture_recovery_image(tmp_path_factory):
    folder=tmp_path_factory.mktemp("capture-recovery")
    asm=folder/"probe.asm"
    exports=tuple(dict.fromkeys(EXPORTS+("rcommit_recover4","rc_test_inputs","owned_end",
                                        "stacktop","rc_anchors","rw_header","rw_buf")))
    # Four caller anchors occupy dead pre-entry RW framing storage. RC copies
    # all448 before any RV/RZ/RW operation; the actual response and the112-byte
    # descriptor remain separate and available for a capture invocation.
    src=Path(__file__).resolve().parents[1]/"native/src"
    cc=(src/"ccnext.asm").read_text()
    stack="times 512 db 0\nstacktop:"
    assert cc.count(stack)==1
    cc=cc.replace(stack,"; actual512 stack relocated after all caller code/data",1)
    names=("record","names","resource","party","currency","xp","roster","state",
           "replay","write","admission","transaction","p1write","owner","peer","commit","submit")
    text=("%define RZ_EXTERNAL_CATALOG rw_header\n%define RU_EXTERNAL_TABLE rl_target_ledger\n"
          "%define RV_EXTERNAL_COMPARE kc_cmp\n%define RV_STREAM_PATHS 1\n"
          "%define RCOMMIT_HAS_RQ 1\n%define RCOMMIT_HAS_SUBMIT 1\n"
          "cpu 386\nbits 16\norg 100h\ndw "+",".join(exports)+"\n"+cc+"\n"+
          "".join('%include "secretreward_'+name+'.inc"\n' for name in names)+
          "rc_test_inputs equ rw_header\nrj_external equ kn_tail\n"
          "times 512 db 0\nstacktop:\nowned_end:\n")
    asm.write_text(text)
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280
    labels=dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))
    assert labels["owned_end"]==labels["stacktop"]==len(raw)+256
    assert labels["rc_test_inputs"]==labels["rw_header"]
    assert labels["rc_test_inputs"]+448<=labels["rw_buf"]+512
    assert raw[-512:]==bytes(512)
    return raw,labels


class CaptureRecoveryMachine(RewardDiskMachine,ActualCoordinator):
    def __init__(self,compiled,files,completed,fixture):
        # ActualCoordinator supplies genuine native child execution. The
        # accepted disk protocol handles all normal file calls via the MRO.
        ActualCoordinator.__init__(self,compiled,files,completed,
                                  consumers=fixture.consumers,producer=fixture.producer_image,
                                  party=fixture.party_image)
        self.fault_at=None;self.protocol_fault="error";self.protocol_error=5
        self.cut_after=None;self.cut_after_call=None
        self.denied_paths=set();self.missing_parents=set()
        self.mutations=0;self.writable_handles=set()
        self.directories=set(fixture.directories)


def test_capture_capable_caller_keeps_existing_candidate_recovery_real(capture_recovery_image,final_capture,commit_owner_base):
    files,paths,final=final_files(commit_owner_base,final_capture)
    m=CaptureRecoveryMachine(capture_recovery_image,files,decode_continuation(final_capture[2]),commit_owner_base[0])
    m.put("kn_prefix",b"C:\\".ljust(112,b"\0"))
    m.put("kn_response",b"C:\\NEXT.BIN".ljust(112,b"\0"))
    m.put("rw_header",b"\xa5"*2048)
    assert capture_invoke(m,paths)==(False,1)
    assert m.get("rc_anchors",448)==b"".join(path.encode().ljust(112,b"\0") for path in paths)
    assert m.disk_snapshot()==final and not m.handles
    assert not m.children and not m.productions
    assert m.get("kn_response",112)==b"C:\\NEXT.BIN".ljust(112,b"\0")
