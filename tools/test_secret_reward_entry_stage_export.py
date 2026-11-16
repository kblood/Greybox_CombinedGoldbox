"""Explicit disposable worker runtime pack; current sources stay read-only."""
import os
from pathlib import Path
import json
import hashlib
import struct

import pytest
from tools.test_secret_reward_entry_stage import (
    stage_image,stage_files,foreign_party,BootstrapMachine,run,entry_record,
    commit_owner_base,owner_base,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture)


def sha(raw):return hashlib.sha256(raw).hexdigest()


def test_export_exact_native_worker_cold_and_valid_foreign_party(stage_image,commit_owner_base):
    destination=os.environ.get("SECRET_ENTRY_STAGE_OUT")
    if not destination:pytest.skip("explicit fresh SECRET_ENTRY_STAGE_OUT required")
    root=Path(destination);assert not root.exists()
    files,output=stage_files(commit_owner_base)
    genuine=BootstrapMachine(stage_image,files)
    assert run(genuine)==0
    expected=entry_record(commit_owner_base)[0]
    assert genuine.disk_snapshot()=={**files,output:expected}
    party,foreign=foreign_party(files)
    parser=BootstrapMachine(stage_image,{})
    parser.uc.mem_write(0x50000,foreign);parser.put("sr_length",struct.pack("<H",len(foreign)))
    assert not parser.call("sr_validate",GS=0x5000)
    cases=(("genuine",files,0),("cold-repeat",genuine.disk_snapshot(),1),
           ("valid-foreign-party",{**files,party:foreign},1))
    manifest={"binary_sha256":sha(stage_image[0]),"raw":len(stage_image[0]),
              "psp":256,"resident":len(stage_image[0])+256,"stack":512,
              "builder_limit":65280,"headroom":65280-len(stage_image[0])-256,
              "command":r"C:\EBSTAGE C:\BOOT.DSC","output":output,
              "expected_grt_bytes":len(expected),"expected_grt_sha256":sha(expected),
              "cases":{}}
    for name,current,status in cases:
        m=BootstrapMachine(stage_image,current)
        assert run(m)==status and not m.before_exit and not m.children
        assert m.disk_snapshot()==({**current,output:expected} if status==0 else current)
        staged={**current,r"C:\EBSTAGE.COM":stage_image[0]}
        records=[]
        for path,raw in sorted(staged.items()):
            drive,relative=path.split(":\\",1)
            target=root/name/drive/Path(*relative.split("\\"))
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
            provenance=("private compiled worker" if path.endswith("EBSTAGE.COM") else
                        "actual closed native unpublished GRT from genuine run" if path==output else
                        "same-length model and native SR-validated external-only foreign name" if name=="valid-foreign-party" and path==party else
                        "genuine native INITIAL/four-menu owned fixture input")
            records.append({"path":path,"bytes":len(raw),"sha256":sha(raw),"provenance":provenance})
        manifest["cases"][name]={"expected_exit":status,"input_files":records,
                                  "expected_output_map":"only appended exact GRT" if status==0 else "all inputs unchanged"}
    (root/"expected.GRT").write_bytes(expected)
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text(
        "Each case has independent C/D trees. Mount only those, not retail directories.\n"
        "Execute C:\\EBSTAGE C:\\BOOT.DSC and capture ERRORLEVEL: genuine0, cold-repeat1, valid-foreign-party1.\n"
        "Genuine appends only manifest.output with expected.GRT exact bytes/hash; preserves all other inputs.\n"
        "Cold repeat and foreign case preserve every guest file. No children/READY/rename/delete/token retirement.\n"
        "expected.GRT outside mounted trees is a host oracle, never a worker input.\n")
