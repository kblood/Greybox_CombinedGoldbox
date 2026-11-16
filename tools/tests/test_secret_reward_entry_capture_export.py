"""Opt-in disposable runtime pack for private kind1 CAPTURE/cold reuse."""
import hashlib
import json
import os
from pathlib import Path

import pytest

from tools.tests.test_secret_reward_entry_capture import (
    capture_image, capture_files, commit_owner_base, CaptureMachine, capture_run,
)
from tools.tests.test_secret_reward_entry_adapter import (
    adapter_image, settled_files, install_image, staged, stage_image, stage_files,
    foreign_party, commit_owner_base, owner_base, image, prepared, inputs,
    consumers, producer_image, party_image, owned_reward_fixture,
)


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


def test_export_private_capture_runtime_pack(capture_image,capture_files,commit_owner_base,tmp_path):
    destination=os.environ.get("SECRET_ENTRY_CAPTURE_OUT")
    if not destination:
        pytest.skip("fresh explicit SECRET_ENTRY_CAPTURE_OUT required")
    root=Path(destination)
    assert not root.exists()
    files,output=capture_files
    expected=commit_owner_base[0].producer_bytes
    party,foreign=foreign_party(files)
    cold={**files,output:expected}
    conflicting={**files,output:b"retained conflicting CAPTURE receipt"}
    foreign_live={**files,party:foreign}
    cases=(
        ("genuine",files,0,{**files,output:expected}),
        ("cold-exact",cold,0,cold),
        ("valid-foreign-party",foreign_live,1,foreign_live),
        ("conflicting-capture",conflicting,1,conflicting),
    )
    manifest={"binary_sha256":sha(capture_image[0]),"raw":len(capture_image[0]),
        "resident":len(capture_image[0])+256,"psp":256,"stack":512,"ceiling":65280,
        "headroom":65280-len(capture_image[0])-256,
        "command":r"C:\EBCAPT C:\BOOT.DSC C:\TOOLS C:\REPLY.BIN",
        "output":output,"expected_capture_bytes":len(expected),
        "expected_capture_sha256":sha(expected),"cases":{}}
    for name,current,status,expected_files in cases:
        machine=CaptureMachine(capture_image,current,commit_owner_base)
        assert capture_run(machine)==status
        actual=machine.disk_snapshot()
        if name=="genuine":
            assert machine.children and len(machine.productions)==1
            assert actual[output]==expected
            assert all(actual[path]==raw for path,raw in current.items())
            workspace=commit_owner_base[0].origin.paths[9].rstrip("\\")+"\\"
            assert all(path==output or path.startswith(workspace) for path in set(actual)-set(current))
            assert not any(raw[:4]==b"GBMO" for raw in actual.values())
            expected_files=actual
        else:
            assert actual==expected_files
            assert not machine.children and not machine.mutation_calls
        if name=="cold-exact":
            assert not machine.productions and not machine.before_exit
        files_for_guest={**current,r"C:\EBCAPT.COM":capture_image[0]}
        files_for_guest.update({
            r"C:\TOOLS\CCFLOW.COM":(Path(__file__).resolve().parents[2]/"native/build/ccflow.com").read_bytes(),
            r"C:\TOOLS\CCECL.COM":(Path(__file__).resolve().parents[2]/"native/build/ccecl.com").read_bytes(),
            r"C:\TOOLS\CCPARTY.COM":(Path(__file__).resolve().parents[2]/"native/build/ccparty.com").read_bytes(),
        })
        # The executable is a mounted input, so the DOS manifest must also
        # assert it remains byte-identical after execution.
        runtime_expected={**expected_files,r"C:\EBCAPT.COM":capture_image[0]}
        manifest["cases"][name]={"expected_exit":status,
            "input_files":records(root,name,files_for_guest),
            "expected_files":[{"path":p,"bytes":len(raw),"sha256":sha(raw)}
                              for p,raw in sorted(runtime_expected.items())],
            "provenance":"GRC from verified native stage/install/recovery chain; kind1 receipt oracle from actual producer"}
    (root/"expected.CAPTURE.GSK").write_bytes(expected)
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text(
        "Mount each case's C and D trees as disposable drives; execute the command in manifest.json.\n"
        "Genuine returns0 and creates the exact CAPTURE.GSK plus listed owned-workspace scratch.\n"
        "Cold-exact returns0 with no child/write.\n"
        "Foreign-party and conflicting-capture return1 without mutation. Verify complete manifests before cleanup.\n"
        "The tool directory is explicit C:\\TOOLS; response C:\\REPLY.BIN is an unused disjoint input.\n")
