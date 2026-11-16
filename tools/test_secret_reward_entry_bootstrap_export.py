"""Explicit disposable guest pack; no retail or production build writes."""
import hashlib
import json
import os
from pathlib import Path

import pytest
from tools.test_secret_reward_entry_bootstrap import (
    bootstrap_image, diagnostic_files, BootstrapMachine, run,
    commit_owner_base, owner_base, image, prepared, inputs, consumers,
    producer_image, party_image, owned_reward_fixture)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def test_export_genuine_bootstrap_and_live_party_mismatch(bootstrap_image,commit_owner_base):
    target = os.environ.get("SECRET_ENTRY_BOOTSTRAP_OUT")
    if not target:
        pytest.skip("explicit disposable SECRET_ENTRY_BOOTSTRAP_OUT required")
    root = Path(target)
    assert not root.exists(), "export requires a fresh destination"
    files = diagnostic_files(commit_owner_base)
    party = files[r"C:\BOOT.DSC"][112:224].split(b"\0",1)[0].decode()
    manifest = {"binary_sha256":sha(bootstrap_image[0]),
                "resident":len(bootstrap_image[0])+256,"stack":512,
                "descriptor":"C:\\BOOT.DSC", "command":"C:\\EBBOOT C:\\BOOT.DSC",
                "provenance":"genuine native import/INITIAL/four-menu owned_reward_fixture; no post-origin authority rewrite",
                "cases":{}}
    for name,status in (("genuine",0),("live-party-mismatch",1)):
        current = dict(files)
        if status: current[party] += b"X"  # external-only mismatch, frozen origin unchanged
        machine = BootstrapMachine(bootstrap_image,current)
        assert run(machine) == status
        assert machine.disk_snapshot() == current and not machine.mutations and not machine.before_exit
        current[r"C:\EBBOOT.COM"] = bootstrap_image[0]
        listing=[]
        for path,raw in sorted(current.items()):
            drive,relative = path.split(":\\",1)
            destination = root/name/drive/Path(*relative.split("\\"))
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(raw)
            listing.append({"path":path,"bytes":len(raw),"sha256":sha(raw),
                            "provenance":"private assembled diagnostic" if path.endswith("EBBOOT.COM") else
                            "external-only trailing-byte mismatch" if status and path == party else
                            "genuine disposable native fixture input"})
        manifest["cases"][name] = {"expected_exit":status,"files":listing}
    manifest["native_result_locations"] = {name:{"offset":bootstrap_image[1][name],"bytes":size}
        for name,size in (("eb_gate",2),("eb_resource",32),("eb_member",756),
                          ("rt_state",160),("rt_items",960),("rt_ledger",1056))}
    (root/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    (root/"RUNTIME.txt").write_text(
        "Mount case/C as C and case/D as D, independently for each case.\n"
        "Run C:\\EBBOOT C:\\BOOT.DSC; record ERRORLEVEL (genuine0/mismatch1).\n"
        "Cold repeat from fresh copies. Inputs must remain byte-identical.\n"
        "No children, output files, journal installation, READY or public mode.\n"
        "Expected native phase0 data remains resident RAM only; manifest gives CS-relative locations.\n")
