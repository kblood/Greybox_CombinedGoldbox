"""Actual MOV-only RC/RS boundary reset preserves registers, flags and owners."""
from pathlib import Path
import shutil
import struct
import subprocess
import re

import pytest
pytest.importorskip("unicorn")
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,STACK,x86

FLAGS=("kc_verified","ro_valid","rj_valid","rj_live_valid","rv_relation_valid",
       "kn_peer_exact","kn_bank_compare","kn_normalize")
EXPORTS=("rc_clear_transients","rc_bad","rs_finish","helper_start","helper_end",
         "control_start","control_end","rc_error","rc_jclose_attempted","kc_fh","kn_peer_fh",
         "kc_probe_fh","rw_fh","kc_view_active","rc_anchors","kn_tail","rs_changed","rs_stage_mask")+FLAGS


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    root=Path(__file__).resolve().parents[1];src=root/"native/src"
    rc=(src/"secretreward_commit.inc").read_text();rs=(src/"secretreward_submit.inc").read_text()
    helper=rc.split("rc_clear_transients:\n",1)[1].split("\nrc_bind_live:",1)[0]
    bad=rc.split("rc_bad:\n",1)[1].split("\n; Exact boundary reset",1)[0]
    finish=re.split(r"\n(?=rs_[A-Za-z0-9_]+\s+(?:dw|db|times|equ)\b)",
                    rs.split("rs_finish:\n",1)[1],maxsplit=1)[0]
    folder=tmp_path_factory.mktemp("exact-transient-reset");asm,binary=folder/"probe.asm",folder/"probe.bin"
    asm.write_text("cpu 386\nbits 16\norg 100h\ndw "+",".join(EXPORTS)+'''
%include "secretcontinuation_io.inc"
helper_start:
rc_clear_transients:
'''+helper+'''
helper_end:
rc_bad:
'''+bad+'''
rs_finish:
'''+finish+'''
control_start:
ro_valid db 0
rj_valid db 0
rj_live_valid db 0
rv_relation_valid db 0
kn_peer_exact db 1
kn_bank_compare db 0
kn_normalize db 0
rc_error dw 0
rc_jclose_attempted db 0
kn_peer_fh dw 0FFFFh
rw_fh dw 0FFFFh
rs_return dw 0
rs_changed db 0
rs_stage_mask db 0
rc_anchors times 448 db 0
kn_tail times 128 db 0
control_end:
''',encoding="ascii")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes();labels=dict(zip(EXPORTS,struct.unpack_from("<"+"H"*len(EXPORTS),raw)))
    assert labels["helper_end"]-labels["helper_start"]==42
    return raw,labels


def seed(image):
    m=RewardDiskMachine(image,{})
    start=m.labels["control_start"];length=m.labels["control_end"]-start
    m.uc.mem_write(BASE+start,bytes((i*37+19)&255 for i in range(length)))
    for name in FLAGS:m.put(name,b"\xa5\x5a" if name=="kc_verified" else b"\xa5")
    m.put("kc_fh",b"\xff\xff");m.put("kc_probe_fh",b"\xd3\x72")
    m.put("kc_view_active",b"\x43")
    return m


def check_reset(m):
    for name in FLAGS:
        expected=b"\1" if name=="kn_peer_exact" else bytes(2 if name=="kc_verified" else 1)
        assert m.get(name,len(expected))==expected


@pytest.mark.parametrize("flags",[2,3,0x46,0x47,0x896,0xc97])
def test_mov_only_helper_preserves_every_register_flags_and_nonflag_storage(image,flags):
    m=seed(image)
    registers={"EAX":0x91827364,"EBX":0xabcdef01,"ECX":0x32768122,"EDX":0xcafebabe,
               "ESI":0x11112222,"EDI":0x33334444,"EBP":0x55667788,
               "CS":0x1000,"DS":0x1000,"ES":0x2345,"FS":0x4000,"GS":0x3000,
               "SS":0x5000,"SP":0xffe0,"EFLAGS":flags}
    for name,value in registers.items():m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    before={name:m.uc.reg_read(getattr(x86,"UC_X86_REG_"+name)) for name in registers}
    region_start=m.labels["control_start"];region_size=m.labels["control_end"]-region_start
    memory=bytearray(m.uc.mem_read(BASE+region_start,region_size))
    for name in FLAGS:
        offset=m.labels[name]-region_start
        if offset>=0:memory[offset]=1 if name=="kn_peer_exact" else 0
    outside={name:m.get(name,n) for name,n in (("kc_fh",2),("kc_probe_fh",2),("kc_view_active",1))}
    m.uc.mem_write(STACK+0xffe0,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels["rc_clear_transients"],BASE+0xff00,count=20)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    for name,value in before.items():
        assert m.uc.reg_read(getattr(x86,"UC_X86_REG_"+name))==(value+2 if name=="SP" else value)
    assert bytes(m.uc.mem_read(BASE+region_start,region_size))==bytes(memory)
    assert all(m.get(name,len(raw))==raw for name,raw in outside.items())
    check_reset(m);assert not m.events and not m.mutations


def test_actual_failure_boundary_preserves_error_close_attempt_and_handles(image):
    m=seed(image);m.put("rc_error",b"\x35\x12");m.put("rc_jclose_attempted",b"\xa7")
    before={name:m.get(name,size) for name,size in (("rc_error",2),("rc_jclose_attempted",1),
             ("kn_peer_fh",2),("rw_fh",2),("kc_fh",2),("kc_probe_fh",2),("kn_tail",128),("rc_anchors",448))}
    assert m.call("rc_bad") and m.uc.reg_read(x86.UC_X86_REG_AX)==0x1235
    check_reset(m);assert all(m.get(name,len(raw))==raw for name,raw in before.items())
    assert not m.events and not m.mutations


def test_actual_closed_submit_finish_preserves_return_and_nontransient_sentinels(image):
    m=seed(image);before={name:m.get(name,size) for name,size in (("rc_error",2),("rc_jclose_attempted",1),
             ("kn_peer_fh",2),("rw_fh",2),("kn_tail",128),("rc_anchors",448),("rs_changed",1),("rs_stage_mask",1))}
    assert not m.call("rs_finish",AX=0x2143)
    assert m.uc.reg_read(x86.UC_X86_REG_AX)==0x2143
    check_reset(m);assert all(m.get(name,len(raw))==raw for name,raw in before.items())
    assert not m.events and not m.mutations


def test_exact_local_code_reclamation_and_movable_reset_order(image):
    _,p=image
    helper=p["helper_end"]-p["helper_start"]
    old=4*41;new=helper+4*3
    assert old-new==110
    print("MOV8 reset helper",helper,"old repeated blocks",old,"new helper+4calls",new,"local saving",old-new)
