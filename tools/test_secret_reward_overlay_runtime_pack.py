"""Explicit disposable DOS runtime export; never writes installed game files."""
import hashlib
import json
import os
import re
from pathlib import Path, PureWindowsPath
import pytest
from tools.test_secret_reward_prepare_overlay import (
    overlay_images, commit_owner_base, final_capture, capture_image, recovery_image,
    commit_image, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base, retained_post, successor_descriptor)
from tools.secret_continuation import decode, encode
from tools.test_secret_reward_public_final import listing_labels


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def export_case(root, name, disk, compiled, commands, expected, provenance):
    directory = root / name
    assert not directory.exists(), "runtime exports must use a fresh disposable path"
    directory.mkdir(parents=True)
    manifest = []
    def put(path, raw, origin):
        guest = PureWindowsPath(path)
        assert guest.drive.upper() in ("C:", "D:") and guest.is_absolute()
        host = directory / guest.drive[0].upper() / Path(*guest.parts[1:])
        host.parent.mkdir(parents=True, exist_ok=True)
        host.write_bytes(raw)
        manifest.append({"guest": str(guest), "host": str(host), "length": len(raw),
                         "sha256": sha(raw), "source": origin})
    build = Path(__file__).resolve().parents[1] / "native/build"
    staged = {path: (bytes(raw), provenance) for path, raw in disk.items()}
    build_script = (build.parent / "build.ps1").read_text()
    targets = re.search(r"\$AllTargets\s*=\s*@\((.*?)\)", build_script, re.S)
    assert targets
    public_tools = re.findall(r'"([a-z0-9]+)"', targets[1])
    assert len(public_tools) == 26 and len(set(public_tools)) == 26
    for tool in public_tools:
        binary = build / (tool + ".com")
        assert binary.is_file()
        if binary.name.lower() != "ccnext.com":
            staged["C:\\" + binary.name.upper()] = (binary.read_bytes(), "current native/build public program")
    ccnext_source = ("current production CCNEXT path overlay, ENTRY disabled"
                     if os.environ.get("SECRET_ENTRY_OVERLAY_RUNTIME_PROFILE") == "production"
                     else "private full ENTRY overlay composition using production conditional coordinator")
    staged[r"C:\CCNEXT.COM"] = (compiled[0], ccnext_source)
    for path, (raw, origin) in staged.items():
        put(path, raw, origin)
    assert len({item["guest"].upper() for item in manifest}) == len(manifest)
    (directory / "expected").mkdir()
    for name, raw in expected.items():
        (directory / "expected" / name).write_bytes(raw)
    data = {"schema": "goldbox-private-overlay-runtime/1", "commands": commands,
            "files": manifest, "expected": {name: {"length": len(raw), "sha256": sha(raw)} for name, raw in expected.items()},
            "resident": len(compiled[0]) + 256, "stack": 512,
            "private_overlay": os.environ.get("SECRET_ENTRY_OVERLAY_RUNTIME_PROFILE", "private-entry") != "production",
            "public_entry_install_claim": False,
            "input_assets_modified": False}
    (directory / "manifest.json").write_text(json.dumps(data, indent=2) + "\n")


def test_export_disposable_genuine_runtime_fixtures(overlay_images, commit_owner_base, final_capture):
    target = os.environ.get("SECRET_ENTRY_OVERLAY_RUNTIME_OUT")
    if not target:
        pytest.skip("explicit disposable SECRET_ENTRY_OVERLAY_RUNTIME_OUT required")
    root = Path(target).resolve()
    assert not root.exists(), "choose an unused runtime export directory"
    root.mkdir(parents=True)
    compiled = overlay_images[1]
    profile = os.environ.get("SECRET_ENTRY_OVERLAY_RUNTIME_PROFILE", "private-entry")
    assert profile in ("private-entry", "production")
    if profile == "production":
        build = Path(__file__).resolve().parents[1] / "native/build"
        binary = (build / "ccnext.com").read_bytes()
        assert sha(binary) == "73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14"
        assert len(binary) + 256 == 64043 and binary[-512:] == bytes(512)
        compiled = binary, listing_labels(build / "ccnext.lst", binary)
    f = commit_owner_base[0]
    initial = decode(f.checkpoints[0][0])
    raw = encode(initial)
    assert raw == f.checkpoints[0][0] and initial.resume_kind == 3
    disk = {initial.paths[0]: initial.part("identity")[16:],
            initial.paths[1]: initial.part("roster"), initial.paths[2]: initial.part("request"),
            initial.paths[4]: initial.part("paused"), initial.paths[5]: initial.part("seed"),
            str(PureWindowsPath(initial.paths[4]).with_suffix(".IDN")): initial.part("identity"),
            r"C:\DESC.BIN": raw[:24] + bytes(40) + raw[64:1216]}
    if initial.part("stream"):
        disk[str(PureWindowsPath(initial.paths[4]).with_suffix(".GBS"))] = initial.part("stream")
    assert initial.paths[8] not in disk
    export_case(root, "fresh-initial", disk, compiled,
                [{"command": "CCNEXT /P C:\\DESC.BIN", "exit": 0},
                 {"command": "CCNEXT /P C:\\DESC.BIN", "exit": 0},
                 {"command": f"CCNEXT /R {initial.paths[1]} {initial.paths[0]} C:\\NEXT.BIN", "exit": 2}],
                {"initial.GSK": raw}, "genuine owned_reward_fixture.checkpoints[0]; exact INITIAL parts/descriptor")
    retained, paths = retained_post(commit_owner_base, final_capture)
    active = decode(final_capture[3])
    retained[r"C:\NEW.DSC"] = successor_descriptor(commit_owner_base, final_capture)
    retained[active.paths[4]] = active.part("successor")
    retained[active.paths[5]] = active.part("seed")
    export_case(root, "retained-final-journal", retained, compiled,
                [{"command": "CCNEXT /P C:\\NEW.DSC", "exit": 1, "all_inputs_preserved": True}],
                {"active.GSK": final_capture[3]},
                "existing retained_post/final_capture + successor_descriptor; same-state native capture")
    (root / "DOSBOX-NOTES.txt").write_text(
        "Luna owns runtime. Use pinned DOSBox-X mode-change candidate, hidden SDL dummy and focusless GameLink.\n"
        "Mount case/C as guest C and case/D as guest D; choose each case separately.\n"
        "Run manifest commands from C:\\; capture ERRORLEVEL and guest files after each command.\n"
        "Fresh INITIAL: compare PARTY.GSK to expected/initial.GSK after prepare/retry and cold /R.\n"
        "Retained final journal: /P must exit1 and preserve every manifest input; no producer/cleanup.\n"
        "Cold reopen means terminate owned DOSBox, remount the SAME disposable case, then invoke /R.\n"
        "No public ENTRY mode/installation is present. Provider/comparator faults and poisons are Unicorn-only.\n")
