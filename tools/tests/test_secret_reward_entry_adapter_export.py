"""Opt-in runtime pack for private post-ENTRY producer-input adapter."""
import hashlib
import json
import os
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_adapter import (
    adapter_image,settled_files,install_image,staged,stage_image,stage_files,
    foreign_party,BootstrapMachine,run,commit_owner_base,owner_base,image,prepared,
    inputs,consumers,producer_image,party_image,owned_reward_fixture)


def sha(raw):return hashlib.sha256(raw).hexdigest()


def test_export_private_adapter_runtime_pack(adapter_image,settled_files,commit_owner_base):
    destination=os.environ.get("SECRET_ENTRY_ADAPTER_OUT")
    if not destination:pytest.skip("fresh explicit SECRET_ENTRY_ADAPTER_OUT required")
    root=Path(destination);assert not root.exists()
    files,output=settled_files
    party,foreign=foreign_party(files)
    expected=commit_owner_base[0].completed_bytes
    cases=(("genuine",files,0),("valid-foreign-party",{**files,party:foreign},1),
           ("existing-grc",{**files,output:b"retained partial/foreign GRC"},1))
    manifest={"binary_sha256":sha(adapter_image[0]),"raw":len(adapter_image[0]),
              "resident":len(adapter_image[0])+256,"psp":256,"stack":512,"ceiling":65280,
              "headroom":65280-len(adapter_image[0])-256,"command":r"C:\EBADAPT C:\BOOT.DSC",
              "output":output,"expected_grc_bytes":len(expected),"expected_grc_sha256":sha(expected),"cases":{}}
    for name,current,status in cases:
        machine=BootstrapMachine(adapter_image,current)
        assert run(machine)==status and not machine.before_exit and not machine.children
        result={**current,output:expected} if status==0 else current
        assert machine.disk_snapshot()==result
        records=[]
        for path,raw in sorted({**current,r"C:\EBADAPT.COM":adapter_image[0]}.items()):
            drive,relative=path.split(":\\",1)
            target=root/name/drive/Path(*relative.split("\\"))
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
            records.append({"path":path,"bytes":len(raw),"sha256":sha(raw)})
        manifest["cases"][name]={"expected_exit":status,"input_files":records,
            "expected_files":[{"path":p,"bytes":len(raw),"sha256":sha(raw)} for p,raw in sorted(result.items())],
            "provenance":"GSK4 from real frozen native staging->installer rename->separate recovery; retired GBMO absent"}
    (root/"expected.GRC").write_bytes(expected)
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text("Mount each independent C/D case; execute C:\\EBADAPT C:\\BOOT.DSC.\nGenuine returns0 and creates only exact GRC; foreign-party/existing-GRC return1 preserving all inputs.\nManifest gives complete input and expected output hashes; COM must remain unchanged.\nNo retail directory mount, producer/action2/READY/token/authority mutation or child execution.\n")
