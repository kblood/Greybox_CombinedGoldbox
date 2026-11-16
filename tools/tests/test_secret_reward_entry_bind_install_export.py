"""Opt-in disposable native action2 installation runtime pack."""
import hashlib
import json
import os
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_bind_install import (
    bind_install_image,bind_staged,bind_image,bind_files,adapter_image,settled_files,install_image,staged,
    stage_image,stage_files,foreign_party,BootstrapMachine,run,commit_owner_base,
    owner_base,image,prepared,inputs,consumers,producer_image,party_image,
    owned_reward_fixture,foreign_grc)



def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def test_export_private_bind_install_runtime_pack(bind_install_image, bind_staged):
    destination = os.environ.get("SECRET_ENTRY_BIND_INSTALL_OUT")
    if not destination:
        pytest.skip("fresh explicit SECRET_ENTRY_BIND_INSTALL_OUT required")
    root = Path(destination)
    assert not root.exists()
    files, output = bind_staged
    expected = files[output]
    journal = str(Path(output).with_suffix(".GRJ"))
    installed = {p: raw for p, raw in files.items() if p != output}
    installed[journal] = expected
    grc, foreign = foreign_grc(files, output)
    cases = (("genuine", files, 0), ("cold-repeat", installed, 1),
             ("valid-foreign-grc", {**files, grc: foreign}, 1),
             ("retained-partial-grt", {**files, output: expected[:1700]}, 1),
             ("retained-partial-grj", {**files, journal: expected[:1700]}, 1))
    manifest = {"binary_sha256": sha(bind_install_image[0]), "raw": len(bind_install_image[0]),
                "resident": len(bind_install_image[0]) + 256, "psp": 256, "stack": 512, "ceiling": 65280,
                "headroom": 65280 - len(bind_install_image[0]) - 256,
                "command": r"C:\EBINST C:\BOOT.DSC", "stage": output, "output": journal,
                "expected_grt_bytes": len(expected), "expected_grt_sha256": sha(expected), "cases": {}}
    for name, current, status in cases:
        machine = BootstrapMachine(bind_install_image, current)
        assert run(machine) == status and not machine.before_exit and not machine.children
        result = installed if status == 0 else current
        assert machine.disk_snapshot() == result
        if status:
            assert not machine.mutations
        records = []
        for path, raw in sorted({**current, r"C:\EBINST.COM": bind_install_image[0]}.items()):
            drive, relative = path.split(":\\", 1)
            target = root / name / drive / Path(*relative.split("\\"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            records.append({"path": path, "bytes": len(raw), "sha256": sha(raw)})
        manifest["cases"][name] = {
            "expected_exit": status, "input_files": records,
            "expected_files": [{"path": path, "bytes": len(raw), "sha256": sha(raw)} for path, raw in sorted(result.items())],
            "provenance": "actual frozen native stage->install->separate recovery->adapter; GBMO retired; actual native Task252 staging; pre-CAPTURE"}
    (root / "expected.GRT").write_bytes(expected)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (root / "RUNTIME.txt").write_text(
        "Mount each disposable C/D case; execute C:\\EBINST C:\\BOOT.DSC.\n"
        "Genuine returns0 and renames exact GRT to GRJ; cold-repeat, valid-foreign-grc, retained-partial-grt/grj return1 with no writes.\n"
        "Compare whole C/D manifests and expected.GRT; pin COM and selected GameLink candidate hashes.\n"
        "Use hidden SDL dummy focusless GameLink v4 only; no retail mounts, EXEC, owner/P1 writes or publication.\n")
