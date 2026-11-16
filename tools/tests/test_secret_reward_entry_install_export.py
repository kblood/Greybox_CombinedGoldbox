"""Opt-in disposable runtime pack: native staged GRT, private installer/recovery."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_install import (
    install_image,staged,stage_image,stage_files,foreign_party,BootstrapMachine,run,
    commit_owner_base,owner_base,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture)
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_reward_entry import entry_record


def sha(raw):return hashlib.sha256(raw).hexdigest()


def test_export_private_install_and_separate_recovery(install_image,staged,commit_owner_base,tmp_path):
    destination=os.environ.get("SECRET_ENTRY_INSTALL_OUT")
    if not destination:pytest.skip("explicit fresh SECRET_ENTRY_INSTALL_OUT required")
    root=Path(destination);assert not root.exists()
    spec=importlib.util.spec_from_file_location("entry_install_export_builder",Path(__file__).resolve().parents[1]/"native-probes/entry_install.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    binary,listing,report=module.build(tmp_path/"recovery",recovery=True)
    recovery=(binary.read_bytes(),listing_labels(listing,binary.read_bytes()))
    files,output=staged
    installer=BootstrapMachine(install_image,files)
    assert run(installer)==0
    installed=installer.disk_snapshot()
    party,foreign=foreign_party(files)
    answer=next(p for p in files if files[p][:4]==b"GBMO")
    no_answer={p:b for p,b in files.items() if p!=answer}
    cases=(("genuine",files,install_image,0),("cold-repeat",installed,install_image,1),
           ("valid-foreign-party",{**files,party:foreign},install_image,1),
           ("missing-gbmo",no_answer,install_image,1),
           ("separate-recovery",installed,recovery,0))
    manifest={"install_sha256":sha(install_image[0]),"install_resident":len(install_image[0])+256,
              "recovery_measurement":report,"stack":512,"psp":256,"ceiling":65280,
              "command":r"C:\EBINST C:\BOOT.DSC","staged_path":output,"cases":{}}
    for name,current,compiled,status in cases:
        machine=BootstrapMachine(compiled,current)
        assert run(machine)==status and not machine.before_exit and not machine.children
        expected=machine.disk_snapshot()
        records=[]
        for path,raw in sorted({**current,r"C:\EBINST.COM":compiled[0]}.items()):
            drive,relative=path.split(":\\",1)
            target=root/name/drive/Path(*relative.split("\\"))
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
            records.append({"path":path,"bytes":len(raw),"sha256":sha(raw)})
        manifest["cases"][name]={"expected_exit":status,"input_files":records,
            "expected_files":[{"path":p,"bytes":len(raw),"sha256":sha(raw)} for p,raw in sorted(expected.items())],
            "binary_sha256":sha(compiled[0]),"provenance":"GRT produced by hash-pinned separate native staging worker; GRJ produced only by native installer rename"}
    (root/"expected.GRT").write_bytes(files[output])
    (root/"expected-owner.GSK").write_bytes(entry_record(commit_owner_base)[1])
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text("Mount each case C/D trees separately; execute C:\\EBINST C:\\BOOT.DSC.\nThe separate-recovery case uses its own recovery diagnostic COM; installer performs no recovery.\nExpected exit and complete post-run file hashes are in manifest.json. COM remains unchanged.\nGenuine makes exactly GRT->GRJ rename; cold-repeat/foreign-party/missing-GBMO preserve all inputs.\n")
