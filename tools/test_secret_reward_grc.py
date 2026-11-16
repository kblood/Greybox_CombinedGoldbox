"""Private exact J15 extraction/reuse; no missing-C producer wiring claim."""
from pathlib import Path
import shutil
import struct
import subprocess
import json
import pytest
from tools.test_secret_reward_final_missing import (
    capture_recovery_image,CaptureRecoveryMachine,final_image,final_capture,
    final_files,commit_owner_base,capture_image,recovery_image,commit_image,image,
    prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture,owner_base)
from tools.secret_continuation import decode as decode_continuation
from tools.test_secret_continuation_io import BASE,x86


@pytest.fixture(scope="module")
def grc_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    _,labels=capture_recovery_image.__wrapped__(factory)
    asm=factory.path/"probe.asm"
    exports=tuple(dict.fromkeys(tuple(labels)+("rc_invoke","rc_bind_live","rc_names",
        "rc_grc_extract","rc_grc_match","rc_grc_present","rc_journal","rr_index",
        "rv_record_relation","rw_close","rw_fh","kc_close","kc_probe","kn_child_path",
        "kn_response_aliases","rc_protocol","rc_classify_peers","rc_final_stage","rc_states","kn_capture_mode","rc_error")))
    asm.write_text(asm.read_text().replace("dw "+",".join(labels),"dw "+",".join(exports),1))
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280
    labels=dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))
    assert labels["stacktop"]==labels["owned_end"]==len(raw)+256
    return raw,labels


def resident_call(m,label,**registers):
    top=m.labels["stacktop"]
    defaults={"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,
              "SP":top-2,"EFLAGS":2,"FS":0x4000,"GS":0x5000}
    for name,value in {**defaults,**registers}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    m.uc.mem_write(BASE+top-2,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels[label],BASE+0xff00,count=50000000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    assert m.uc.reg_read(x86.UC_X86_REG_SP)==top
    assert m.uc.reg_read(x86.UC_X86_REG_SS)==BASE>>4
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


def admitted(grc_image,base,captured,extra=None):
    files,paths,_=final_files(base,captured)
    del files[str(Path(paths[0]).with_suffix(".GKT"))]
    # Explicit current source-chain helper inputs, never original host writes.
    tools=(r"C:\CCPARTY.COM",r"C:\CCFLOW.COM",r"C:\CCECL.COM")
    binaries=(base[0].party_image[0],base[0].consumers["flow"][0],base[0].producer_image[0])
    for path,binary in zip(tools,binaries):
        files[path]=binary
    if extra: files.update(extra)
    m=CaptureRecoveryMachine(grc_image,files,decode_continuation(captured[2]),base[0])
    m.put("kn_prefix",b"C:\\".ljust(112,b"\0"))
    m.put("kn_response",b"C:\\NEXT.BIN".ljust(112,b"\0"))
    m.put("rc_test_inputs",b"".join(path.encode().ljust(112,b"\0") for path in paths))
    start=m.labels["rc_test_inputs"]
    assert not resident_call(m,"rc_invoke",DX=m.labels["owned_end"],SI=start,DI=start+112,BX=start+224,BP=start+336)
    assert not resident_call(m,"rr_index",DX=m.labels["rc_journal"])
    assert not resident_call(m,"rv_record_relation",DX=m.labels["owned_end"])
    assert not resident_call(m,"rc_bind_live")
    assert not resident_call(m,"kn_response_aliases")
    for path in tools:
        m.put("kn_child_path",path.encode().ljust(112,b"\0"))
        assert not resident_call(m,"kc_probe",DX=m.labels["kn_child_path"])
        assert m.uc.reg_read(x86.UC_X86_REG_AX)==1
    assert base[0].origin.paths[9]+r"\CAPTURE.GSK" not in files
    return m,files,paths


def test_exclusive_closed_grc_matches_whole_input_and_reuses_cold(grc_image,commit_owner_base,final_capture):
    m,files,paths=admitted(grc_image,commit_owner_base,final_capture)
    grc=str(Path(paths[0]).with_suffix(".GRC"))
    assert not resident_call(m,"rc_grc_extract")
    assert m.disk_snapshot()[grc]==final_capture[2]
    assert m.get("rw_fh",2)==b"\xff\xff"
    assert m.get("rc_grc_present",1)==b"\1"
    assert not resident_call(m,"kc_close") and not m.handles
    expected={**files,grc:final_capture[2]}
    assert m.disk_snapshot()==expected and not m.children and not m.productions
    cold,_,_=admitted(grc_image,commit_owner_base,final_capture,{grc:final_capture[2]})
    assert not resident_call(cold,"rc_grc_extract")
    assert cold.disk_snapshot()==expected and not cold.mutations
    assert not resident_call(cold,"kc_close") and not cold.handles


def test_private_missing_candidate_stage_runs_actual_capture_and_restores_journal(grc_image,commit_owner_base,final_capture):
    m,files,paths=admitted(grc_image,commit_owner_base,final_capture)
    assert not resident_call(m,"rc_classify_peers")
    assert m.get("rc_states",6)==b"\1\0\0\3\0\0"
    assert not m.mutations
    bad=resident_call(m,"rc_final_stage")
    if bad:
        print(json.dumps({"rc_error":struct.unpack("<H",m.get("rc_error",2))[0],
                          "failures":m.failures,"events":m.events[-35:],"children":m.children,
                          "descriptor":m.get("kn_descriptor",112).hex(),"files":list(m.files)}))
    assert not bad
    grc=str(Path(paths[0]).with_suffix(".GRC"))
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    capture=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    assert m.disk_snapshot()[grc]==final_capture[2]
    assert m.disk_snapshot()[candidate]==final_capture[3]
    assert capture not in m.files
    for path,body in files.items(): assert bytes(m.files[path])==body
    assert len(m.productions)==1
    assert m.get("kn_capture_mode",1)==b"\0"
    assert m.cwd=="C:\\"
    assert not resident_call(m,"kc_close") and not m.handles
