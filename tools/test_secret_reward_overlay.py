"""Exact compiled default/overlaid reward derivation and journal differential.

This private gate does not establish public recovery or all overlay lifetimes.
"""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_owner import owner_image, owner_base, current, states
from tools.test_secret_reward_transaction import (
    image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, machine, derive, close, request, intent)
from tools.secret_reward import encode
from tools.secret_reward_state import action


@pytest.fixture(scope="module")
def overlay_pair(tmp_path_factory):
    variants = []
    for overlaid in (False, True):
        class Factory:
            def mktemp(self, name):
                self.path = tmp_path_factory.mktemp(name)
                return self.path
        factory = Factory()
        _, original = owner_image.__wrapped__(factory)
        source = factory.path / "probe.asm"
        exports = tuple(original) + ("rz_catalog", "rz_length", "rt_state", "rt_items", "rt_ledger", "rq_write", "rq_fh")
        text = source.read_text().replace("dw " + ",".join(original), "dw " + ",".join(exports), 1)
        text = text.replace("owned_end:", '%include "secretreward_p1write.inc"\nowned_end:', 1)
        if overlaid:
            text = "%define RZ_EXTERNAL_CATALOG rw_header\n" + text
        source.write_text(text)
        binary = source.with_suffix(".bin")
        nasm = shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
        src = Path(__file__).resolve().parents[1]/"native/src"
        run = subprocess.run([nasm, "-I", str(src)+"/", "-f", "bin", str(source), "-o", str(binary)],
                             capture_output=True, timeout=30)
        assert run.returncode == 0, run.stderr
        raw = binary.read_bytes()
        assert len(raw)+256 < 65536
        labels = dict(zip(exports, struct.unpack_from("<"+"H"*len(exports), raw)))
        variants.append((raw, labels))
    default, overlay = variants
    assert len(default[0])-len(overlay[0]) == 2048
    labels = overlay[1]
    assert labels["rz_catalog"] == labels["rw_header"]
    assert labels["rw_paths"]-labels["rw_header"] == 256
    assert labels["rw_context"]-labels["rw_header"] == 1488
    assert labels["rw_specs"]-labels["rw_header"] == 1520
    assert labels["rw_buf"]-labels["rw_header"] == 1712
    assert labels["rz_catalog"]+2048 == labels["rw_buf"]+336
    assert labels["rw_fh"] < labels["rw_header"]
    return variants


@pytest.mark.parametrize("phase,kind,args", [
    ("result",5,{}), ("items",10,{"recipient":1,"item":11}),
    ("amount",12,{"recipient":1,"value":3}),
    ("amount",12,{"recipient":1,"value":0}),
    ("amount",13,{}), ("confirm",16,{})])
def test_poisoned_replay_rebuilds_exact_images_and_journal(overlay_pair, owner_base, phase, kind, args):
    pre = states(owner_base)[phase]
    old = current(owner_base, pre, 1)
    req = request(pre, kind, **args)
    post, result = action(pre, kind, **args)
    expected = encode(intent(old, pre, post, req, result))
    results = []
    for compiled in overlay_pair:
        m, raw = machine(compiled, old, req)
        # Poison framing, specifications, all 336 aliased buffer bytes and
        # the unaliased suffix before actual nested replay/action derivation.
        m.put("rw_header", bytes((i*37+11)&255 for i in range(2224)))
        assert not derive(m)
        length = struct.unpack("<H", m.get("rz_length", 2))[0]
        outputs = (bytes(m.uc.mem_read(0x40000, length)), m.get("rt_state",160),
                   m.get("rt_items",960), m.get("rt_ledger",1056))
        framing = m.get("rw_header",1712)
        m.put("ro_peer", b"C:\\POST.GRP\0")
        assert not m.call("rq_write", DX=m.labels["ro_peer"], FS=0x4000, GS=0x5000)
        assert m.get("rq_fh",2) == b"\xff\xff"
        assert bytes(m.files["C:\\POST.GRP"]) == outputs[0]
        assert m.get("rw_header",1712) == framing
        assert bytes(m.uc.mem_read(0x40000,length)) == outputs[0]
        assert not m.call("rj_stage_intent", FS=0x4000, GS=0x5000)
        path = m.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
        journal = bytes(m.files[path])
        assert journal == expected
        results.append(outputs + (journal,))
        close(m, raw, req)
    assert results[0] == results[1]
