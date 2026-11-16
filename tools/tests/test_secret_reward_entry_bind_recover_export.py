"""Opt-in disposable actual native action2 recovery runtime cases."""
import hashlib
import json
import os
from pathlib import Path
import pytest
from tools.tests.test_secret_reward_entry_bind_recover import (
    bind_recover_image,bind_installed,bind_install_image,bind_staged,bind_image,
    bind_files,adapter_image,settled_files,install_image,staged,stage_image,
    stage_files,foreign_party,BootstrapMachine,run,commit_owner_base,owner_base,
    image,prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture,
    foreign_grc,row_files,roles,owner_oracle,expected,decode)


def sha(raw):return hashlib.sha256(raw).hexdigest()


def test_export_private_action2_recovery_runtime_pack(bind_recover_image,bind_installed):
    destination=os.environ.get("SECRET_ENTRY_BIND_RECOVER_OUT")
    if not destination:pytest.skip("fresh explicit SECRET_ENTRY_BIND_RECOVER_OUT required")
    root=Path(destination);assert not root.exists()
    files,journal=bind_installed;owner,backup,candidate=roles(files,journal)
    final=expected(files,journal);grc,foreign=foreign_grc(files,journal)
    capture=decode(files[journal]).paths[9*112:10*112].split(b"\0",1)[0].decode()+r"\CAPTURE.GSK"
    cases=(("genuine",files,0),("candidate-ready",row_files(files,journal,(1,0,2)),0),
        ("backup-ready",row_files(files,journal,(0,1,2)),0),("published-backup",row_files(files,journal,(2,1,0)),0),
        ("published-journal",row_files(files,journal,(2,0,0)),0),("no-journal",final,0),
        ("valid-foreign-grc",{**files,grc:foreign},1),("retained-partial-candidate",{**files,candidate:owner_oracle(files[journal])[:1700]},1),
        ("capture-present",{**files,capture:b"retained foreign CAPTURE"},1))
    raw=bind_recover_image[0]
    manifest={"binary_sha256":sha(raw),"raw":len(raw),"resident":len(raw)+256,"psp":256,"stack":512,"ceiling":65280,
        "headroom":65280-len(raw)-256,"command":r"C:\EBRECV C:\BOOT.DSC","journal":journal,"owner":owner,
        "expected_journal_bytes":len(files[journal]),"expected_journal_sha256":sha(files[journal]),
        "expected_owner_bytes":len(final[owner]),"expected_owner_sha256":sha(final[owner]),"cases":{}}
    for name,current,status in cases:
        machine=BootstrapMachine(bind_recover_image,current)
        assert run(machine)==status and not machine.before_exit and not machine.children
        result=final if status==0 else current
        assert machine.disk_snapshot()==result and not machine.handles
        if status or name=="no-journal":assert not machine.mutations
        assert not any(e.get("path","").endswith(".GRA") for e in machine.events)
        assert all(e.get("path")!=grc for e in machine.events if e.get("mutation"))
        records=[]
        for path,body in sorted({**current,r"C:\EBRECV.COM":raw}.items()):
            drive,relative=path.split(":\\",1);target=root/name/drive/Path(*relative.split("\\"))
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
            records.append({"path":path,"bytes":len(body),"sha256":sha(body)})
        manifest["cases"][name]={"expected_exit":status,"input_files":records,
            "expected_files":[{"path":path,"bytes":len(body),"sha256":sha(body)} for path,body in sorted(result.items())],
            "provenance":"actual native ENTRY stage/install/recovery/adapter/BIND/action2 install; private recovery only"}
    (root/"expected-owner.GSK").write_bytes(final[owner]);(root/"input-journal.GRJ").write_bytes(files[journal])
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text("Mount each disposable C/D case; run C:\\EBRECV C:\\BOOT.DSC.\n"
        "Five genuine publication rows and no-journal return0; foreignGRC/partialC/CAPTURE return1 unchanged.\n"
        "GRC remains exact/present; GRA remains untouched. Compare complete manifests and expected-owner.GSK.\n"
        "Hidden SDL dummy/focusless GameLink v4 only; no retail mounts or EXEC; pin selected candidate hash.\n")
