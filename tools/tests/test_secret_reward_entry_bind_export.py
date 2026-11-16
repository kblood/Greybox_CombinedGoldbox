"""Opt-in disposable native action2 staging runtime pack."""
import hashlib
import json
import os
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_bind import (
    bind_image, bind_files, adapter_image, settled_files, install_image, staged,
    stage_image, stage_files, foreign_party, BootstrapMachine, run, commit_owner_base,
    owner_base, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, journal_oracle, foreign_grc)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def test_export_private_bind_runtime_pack(bind_image, bind_files):
    destination = os.environ.get("SECRET_ENTRY_BIND_OUT")
    if not destination:
        pytest.skip("fresh explicit SECRET_ENTRY_BIND_OUT required")
    root = Path(destination)
    assert not root.exists()
    files, output = bind_files
    expected = journal_oracle(files, output)
    grc, foreign = foreign_grc(files, output)
    cases = (("genuine", files, 0), ("cold-repeat", {**files, output: expected}, 1),
             ("valid-foreign-grc", {**files, grc: foreign}, 1),
             ("retained-partial-grt", {**files, output: expected[:1700]}, 1))
    manifest = {"binary_sha256": sha(bind_image[0]), "raw": len(bind_image[0]),
                "resident": len(bind_image[0]) + 256, "psp": 256, "stack": 512, "ceiling": 65280,
                "headroom": 65280 - len(bind_image[0]) - 256,
                "command": r"C:\EBBIND C:\BOOT.DSC", "output": output,
                "expected_grt_bytes": len(expected), "expected_grt_sha256": sha(expected), "cases": {}}
    for name, current, status in cases:
        machine = BootstrapMachine(bind_image, current)
        assert run(machine) == status and not machine.before_exit and not machine.children
        result = {**current, output: expected} if status == 0 else current
        assert machine.disk_snapshot() == result
        if status:
            assert not machine.mutations
        records = []
        for path, raw in sorted({**current, r"C:\EBBIND.COM": bind_image[0]}.items()):
            drive, relative = path.split(":\\", 1)
            target = root / name / drive / Path(*relative.split("\\"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            records.append({"path": path, "bytes": len(raw), "sha256": sha(raw)})
        manifest["cases"][name] = {
            "expected_exit": status, "input_files": records,
            "expected_files": [{"path": path, "bytes": len(raw), "sha256": sha(raw)} for path, raw in sorted(result.items())],
            "provenance": "actual frozen native stage->install->separate recovery->adapter; GBMO retired; pre-CAPTURE"}
    (root / "expected.GRT").write_bytes(expected)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (root / "RUNTIME.txt").write_text(
        "Mount each disposable C/D case; execute C:\\EBBIND C:\\BOOT.DSC.\n"
        "Genuine returns0 and adds only exact GRT; cold-repeat, valid-foreign-grc, retained-partial-grt return1 with no writes.\n"
        "Compare whole C/D manifests and expected.GRT; pin COM and selected GameLink candidate hashes.\n"
        "Use hidden SDL dummy focusless GameLink v4 only; no retail mounts, EXEC, rename, owner/P1 writes or publication.\n")
