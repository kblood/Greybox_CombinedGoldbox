"""Retained producer/restoration handles quarantine warm recovery."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest
from tools.test_secret_reward_final_missing import (
    capture_recovery_image,CaptureRecoveryMachine,capture_invoke,
    final_image,final_capture,final_files,commit_owner_base,capture_image,
    recovery_image,commit_image,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,owner_base)
from tools.secret_continuation import decode as decode_continuation

SLOTS=("kw_out","kw_live_fh","kf_out","kf_live","kf_other")


@pytest.fixture(scope="module")
def guarded_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    _,labels=capture_recovery_image.__wrapped__(factory)
    asm=factory.path/"probe.asm"
    exports=tuple(dict.fromkeys(tuple(labels)+SLOTS))
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


@pytest.mark.parametrize("slot",SLOTS)
def test_each_retained_helper_handle_blocks_without_dos_or_reset(guarded_image,final_capture,commit_owner_base,slot):
    files,paths,_=final_files(commit_owner_base,final_capture)
    path=r"C:\RETAIN.BIN";files[path]=b"retained owned descriptor"
    m=CaptureRecoveryMachine(guarded_image,files,decode_continuation(final_capture[2]),commit_owner_base[0])
    # Negative ownership setup only: no semantic admission/publication flag.
    fd=m.open_other(path)
    m.put(slot,struct.pack("<H",fd))
    controls={name:m.get(name,2) for name in SLOTS}
    anchors=m.get("rc_anchors",448)
    for _ in range(2):
        assert capture_invoke(m,paths)==(True,1)
        assert not m.events and not m.children and not m.productions
        assert m.disk_snapshot()==files and not m.mutations
        assert m.handles[fd][0]==path
        assert {name:m.get(name,2) for name in SLOTS}==controls
        assert m.get("rc_anchors",448)==anchors
