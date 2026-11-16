"""Keep the GoldBox VHD runtime declaration aligned with native build targets."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "native" / "release-manifest.json"
BUILD_SCRIPT = ROOT / "native" / "build.ps1"
SCHEMA = "goldbox-native-runtime-manifest/1"
EXTERNAL_VHD_SCRIPTS = [
    r"C:\LLM\DOS\BuildReleasesVHD.ps1",
    r"C:\LLM\DOS\VerifyReleaseVHD.ps1",
    r"C:\LLM\DOS\VerifyGoldBoxPlayableVHD.ps1",
]


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def native_all_targets() -> set[str]:
    source = BUILD_SCRIPT.read_text(encoding="utf-8")
    match = re.search(r"\$AllTargets\s*=\s*@\((.*?)\n\)", source, re.DOTALL)
    assert match, "native/build.ps1 must declare $AllTargets"
    return {f"{name.upper()}.COM" for name in re.findall(r'"([a-z0-9]+)"', match.group(1))}


def test_release_manifest_declares_every_native_build_target_once() -> None:
    manifest = load_manifest()
    assert manifest["schema"] == SCHEMA
    entries = manifest["executables"]
    names = [entry["name"] for entry in entries]
    assert len(names) == len(set(names))
    assert set(names) == native_all_targets()
    assert all(re.fullmatch(r"[A-Z0-9]{1,8}\.(?:COM|EXE)", name) for name in names)
    assert all(entry.get("required") is True for entry in entries)
    assert all(entry.get("guest_verify") is True for entry in entries)


def assert_external_vhd_scripts_are_pinned(scripts: list[dict]) -> None:
    assert len(scripts) == len(EXTERNAL_VHD_SCRIPTS)
    paths = [entry["path"] for entry in scripts]
    assert paths == EXTERNAL_VHD_SCRIPTS
    for entry in scripts:
        assert re.fullmatch(r"[0-9A-F]{64}", entry["sha256"])
        path = Path(entry["path"])
        if path.is_file():
            actual = hashlib.sha256(path.read_bytes()).hexdigest().upper()
            assert actual == entry["sha256"]


def test_external_vhd_scripts_are_pinned_when_present() -> None:
    assert_external_vhd_scripts_are_pinned(load_manifest()["external_scripts"])


def test_external_vhd_script_contract_rejects_removed_or_drifted_playable_verifier() -> None:
    scripts = load_manifest()["external_scripts"]
    with pytest.raises(AssertionError):
        assert_external_vhd_scripts_are_pinned(scripts[:-1])

    drifted = [dict(entry) for entry in scripts]
    drifted[-1]["sha256"] = "0" * 64
    with pytest.raises(AssertionError):
        assert_external_vhd_scripts_are_pinned(drifted)
