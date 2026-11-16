"""Three-alias submit/recovery; oversized two-alias composition stays unexecuted."""
from pathlib import Path
from dataclasses import replace
import re
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_reward_submit import (
    submit_image, fresh, submit, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut
from tools.test_secret_reward_owner import current
from tools.secret_reward import encode as encode_reward, decode as decode_reward


@pytest.fixture(scope="module")
def submission_images(tmp_path_factory):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name)
            return self.path
    factory = Factory()
    integrated = submit_image.__wrapped__(factory)
    base = (factory.path / "probe.asm").read_text()
    exports = re.search(r"(?m)^dw (.+)$", base).group(1).split(",")
    macro = "%define RV_EXTERNAL_COMPARE kc_cmp\n"
    assert base.count(macro) == 1, "integrated caller must explicitly select the approved third alias"
    stream_macro = "%define RV_STREAM_PATHS 1\n"
    assert base.count(stream_macro) == 1, "integrated caller must explicitly select streamed paths"
    # Retain the real complete two-alias image as a capacity negative. It is
    # assembled and measured, but never mapped or passed to a guest machine.
    negative = tmp_path_factory.mktemp("submit-two-alias-capacity-negative")
    negative_asm, negative_binary = negative / "probe.asm", negative / "probe.bin"
    negative_asm.write_text(base.replace(macro, "", 1).replace(stream_macro, "", 1))
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    src = Path(__file__).resolve().parents[1] / "native/src"
    negative_run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(negative_asm),
                                   "-o", str(negative_binary)], capture_output=True, timeout=30)
    assert negative_run.returncode == 0, negative_run.stderr
    negative_size = len(negative_binary.read_bytes())
    assert negative_size + 256 > 65280
    # Removing only the comparison alias from the same streamed profile saves
    # exactly the proven 512-byte alias block, but that image may still fit.
    paired = tmp_path_factory.mktemp("submit-streamed-two-aliases")
    paired_asm, paired_binary = paired / "probe.asm", paired / "probe.bin"
    paired_asm.write_text(base.replace(macro, "", 1))
    paired_run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(paired_asm),
                                 "-o", str(paired_binary)], capture_output=True, timeout=30)
    assert paired_run.returncode == 0, paired_run.stderr
    paired_size = len(paired_binary.read_bytes())
    folder = tmp_path_factory.mktemp("submit-three-aliases-reparsed")
    asm, binary, listing = folder / "probe.asm", folder / "probe.bin", folder / "probe.lst"
    asm.write_text(base)
    run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(asm),
                          "-o", str(binary), "-l", str(listing)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    assert len(raw) + 256 <= 65280
    assert paired_size - len(raw) == 512
    assert raw == integrated[0]
    labels = dict(zip(exports, struct.unpack_from("<" + "H" * len(exports), raw)))
    for line in listing.read_text().splitlines():
        match = re.search(r"^\s*\d+\s+(?:<\d+>\s+)?([0-9A-F]{8})\s+.*\b(ro_valid|rv_relation_valid)\s+db\b", line)
        if match:
            labels[match.group(2)] = int(match.group(1), 16) + 256
    assert labels == integrated[1]
    return {True: (raw, labels)}


@pytest.mark.parametrize("phase,kind,args", [("items", 10, {"recipient": 1, "item": 11}),
                                            ("result", 5, {})])
def test_three_aliases_preserve_actual_submit_reuse_and_cold_recovery(submission_images, commit_owner_base, phase, kind, args):
    files, paths, journal, post = fresh(commit_owner_base, phase, kind, args)
    expected = replace(current(commit_owner_base, post, 2), paths=journal[256:1488])
    final = {p: body for p, body in files.items() if not p.endswith(".GRA")}
    final[paths[0]], final[paths[1]] = encode_reward(expected), expected.sections[7]
    grp, grt, grj = (str(Path(paths[0]).with_suffix("." + suffix)) for suffix in ("GRP", "GRT", "GRJ"))
    for alias in submission_images:
        compiled = submission_images[alias]
        baseline = RewardDiskMachine(compiled, files)
        assert submit(baseline, paths) == (False, 1)
        assert baseline.disk_snapshot()[grj] == journal and not baseline.handles
        cut_indices = {}
        for event in baseline.events:
            if event["ax"] >> 8 == 0x3e and event.get("path") in (grp, grt):
                cut_indices.setdefault(event["path"], event["index"])
        paired = decode_reward(journal)
        assert set(cut_indices) == ({grp, grt} if paired.sections[6] != paired.sections[7] else {grt})
        pending = [baseline.disk_snapshot()]
        for at in cut_indices.values():
            interrupted = RewardDiskMachine(compiled, files, cut_after_call=at)
            with pytest.raises(DiskCut):
                submit(interrupted, paths)
            resumed = RewardDiskMachine(compiled, interrupted.disk_snapshot())
            assert submit(resumed, paths) == (False, 1)
            assert resumed.disk_snapshot()[grj] == journal and not resumed.handles
            pending.append(resumed.disk_snapshot())
        for snapshot in pending:
            recovered = RewardDiskMachine(compiled, snapshot)
            assert invoke(recovered, paths) == (False, 1)
            assert recovered.disk_snapshot() == final and not recovered.handles
            repeated = RewardDiskMachine(compiled, recovered.disk_snapshot())
            assert invoke(repeated, paths) == (False, 0)
            assert repeated.disk_snapshot() == final and not repeated.mutations and not repeated.handles


@pytest.mark.parametrize("failure", ["foreign-stage", "final-source-close"])
def test_three_aliases_preserve_refused_or_unclosed_staging(submission_images, commit_owner_base, failure):
    files, paths, _, _ = fresh(commit_owner_base)
    grt = str(Path(paths[0]).with_suffix(".GRT"))
    for alias in submission_images:
        compiled = submission_images[alias]
        baseline = RewardDiskMachine(compiled, files)
        assert submit(baseline, paths) == (False, 1)
        at = next(e["index"] for e in baseline.events if e["ax"] >> 8 == 0x3e and e.get("path") == grt)
        interrupted = RewardDiskMachine(compiled, files, cut_after_call=at)
        with pytest.raises(DiskCut):
            submit(interrupted, paths)
        snapshot = interrupted.disk_snapshot()
        if failure == "foreign-stage":
            altered = bytearray(snapshot[grt])
            altered[-2] ^= 1
            snapshot[grt] = bytes(altered)
            failed = RewardDiskMachine(compiled, snapshot)
        else:
            control = RewardDiskMachine(compiled, snapshot)
            assert submit(control, paths) == (False, 1)
            at = max(e["index"] for e in control.events if e["ax"] >> 8 == 0x3e and e.get("path") == grt)
            failed = RewardDiskMachine(compiled, snapshot, fault_at=at)
        assert submit(failed, paths)[0]
        assert failed.disk_snapshot() == snapshot and not failed.mutations
        if failure == "final-source-close":
            assert len(failed.handles) == 1
            assert sum(e["ax"] >> 8 == 0x3e for e in failed.events if e["index"] >= at) == 1
            count = len(failed.events)
            assert submit(failed, paths) == (True, 1) and len(failed.events) == count
        else:
            assert not failed.handles
