"""Opt-in disposable runtime pack for private kind1 CAPTURE/cold reuse."""
import hashlib
import json
import os
from pathlib import Path

import pytest

from tools.tests.test_secret_reward_entry_phase1_capture import (
    phase1_capture_image,phase1_capture_files,commit_owner_base,CaptureMachine,capture_run,declared_workspace_files,
    bind_recover_image,bind_installed,bind_install_image,bind_staged,bind_image,
    bind_files,adapter_image,settled_files,install_image,staged,stage_image,stage_files,
    foreign_party,owner_base,image,prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture)
from tools.tests.test_secret_reward_entry_bind import foreign_grc


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def records(root, name, files):
    result=[]
    for path,raw in sorted(files.items()):
        drive,relative=path.split(":\\",1)
        target=root/name/drive/Path(*relative.split("\\"))
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(raw)
        result.append({"path":path,"bytes":len(raw),"sha256":sha(raw)})
    return result


def test_export_private_capture_runtime_pack(phase1_capture_image,phase1_capture_files,commit_owner_base,tmp_path):
    destination=os.environ.get("SECRET_ENTRY_PHASE1_CAPTURE_OUT")
    if not destination:
        pytest.skip("fresh explicit SECRET_ENTRY_PHASE1_CAPTURE_OUT required")
    root=Path(destination)
    assert not root.exists()
    files,output=phase1_capture_files
    fresh=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(fresh)==0
    cold=fresh.disk_snapshot() # actual complete disk, including producer scratch
    expected=cold[output]
    assert expected==commit_owner_base[0].producer_bytes
    grc,foreign=foreign_grc(files,next(p for p in files if p.endswith(".GRC")))
    conflicting={**files,output:b"retained conflicting CAPTURE receipt"}
    retained_journal={**files,str(Path(grc).with_suffix(".GRJ")):b"retained transaction journal"}
    foreign_live={**files,grc:foreign}
    cases=(
        ("genuine",files,0,cold),
        ("cold-exact",cold,0,cold),
        ("valid-foreign-grc",foreign_live,1,foreign_live),
        ("conflicting-capture",conflicting,1,conflicting),
        ("retained-journal",retained_journal,1,retained_journal),
    )
    manifest={"binary_sha256":sha(phase1_capture_image[0]),"raw":len(phase1_capture_image[0]),
        "resident":len(phase1_capture_image[0])+256,"psp":256,"stack":512,"ceiling":65280,
        "headroom":65280-len(phase1_capture_image[0])-256,
        "command":r"C:\EBPCAPT C:\BOOT.DSC C:\TOOLS C:\REPLY.BIN",
        "output":output,"expected_capture_bytes":len(expected),
        "expected_capture_sha256":sha(expected),"cases":{}}
    for name,current,status,expected_files in cases:
        machine=CaptureMachine(phase1_capture_image,current,commit_owner_base)
        assert capture_run(machine)==status
        actual=machine.disk_snapshot()
        assert not machine.before_exit
        assert not any(e.get("path","").endswith(".GRA") for e in machine.events)
        if name=="genuine":
            assert machine.children and len(machine.productions)==1
            assert actual[output]==expected
            assert all(actual[path]==raw for path,raw in current.items())
            workspace=commit_owner_base[0].origin.paths[9].rstrip("\\")+"\\"
            assert set(actual)-set(current)<=declared_workspace_files(machine,workspace)
            assert not any(raw[:4]==b"GBMO" for raw in actual.values())
            expected_files=actual
        else:
            assert actual==expected_files
            assert not machine.children and not machine.mutation_calls
        if name=="cold-exact":
            assert not machine.productions and not machine.before_exit
        files_for_guest={**current,r"C:\EBPCAPT.COM":phase1_capture_image[0]}
        files_for_guest.update({
            r"C:\TOOLS\CCFLOW.COM":(Path(__file__).resolve().parents[2]/"native/build/ccflow.com").read_bytes(),
            r"C:\TOOLS\CCECL.COM":(Path(__file__).resolve().parents[2]/"native/build/ccecl.com").read_bytes(),
            r"C:\TOOLS\CCPARTY.COM":(Path(__file__).resolve().parents[2]/"native/build/ccparty.com").read_bytes(),
        })
        # The executable is a mounted input, so the DOS manifest must also
        # assert it remains byte-identical after execution.
        runtime_expected={**expected_files,r"C:\EBPCAPT.COM":phase1_capture_image[0]}
        manifest["cases"][name]={"expected_exit":status,
            "input_files":records(root,name,files_for_guest),
            "expected_files":[{"path":p,"bytes":len(raw),"sha256":sha(raw)}
                              for p,raw in sorted(runtime_expected.items())],
            "provenance":"Authentic phase1 owner from actual ENTRY/BIND/install/recovery chain; cold input is actual fresh disk snapshot; unchanged native producer"}
    (root/"expected.CAPTURE.GSK").write_bytes(expected)
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text(
        "Mount each case's C and D trees as disposable drives; execute the command in manifest.json.\n"
        "Genuine returns0 and creates the exact CAPTURE.GSK plus listed owned-workspace scratch.\n"
        "Cold-exact returns0 with no child/write.\n"
        "Foreign-GRC, conflicting-capture and retained-journal return1 without mutation. Verify complete manifests before cleanup.\n"
        "The tool directory is explicit C:\\TOOLS; response C:\\REPLY.BIN is an unused disjoint input.\n")
