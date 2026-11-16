"""GBBOOT title-membership chains (round 7, T1a).

GBBOOT used to spend ~500 bytes on 13-compare `cmp word [gamep], game_X` chains.
They are now one range-check helper (`party_game`) that depends on the order of the
consecutive `game_*` title strings. This file pins both halves:

* no run of >= 10 consecutive gamep title compares may remain;
* the title labels keep the order party_game relies on, and the assembler itself
  refuses a reordering (mutation-tested below with a swapped copy of the source).
"""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "native" / "src" / "gbboot.asm"
NASM_FALLBACK = Path.home() / "AppData" / "Local" / "bin" / "NASM" / "nasm.exe"

CMP_RE = re.compile(r"^\s*cmp\s+word\s*\[gamep\],\s*game_\w+\s*(;.*)?$")
JCC_RE = re.compile(r"^\s*j\w+\s+\S+\s*(;.*)?$")
LABEL_RE = re.compile(r"^(game_\w+)\s+db\s", re.M)

EXPECTED_ORDER = ["cok", "dok", "pool", "curse", "secret", "gateway", "nwn", "treasures",
                  "pod", "buck", "matrix", "dqk", "gen1", "frua", "hlib_data"]


def longest_run(lines):
    best = run = 0
    i = 0
    while i < len(lines) - 1:
        if CMP_RE.match(lines[i]) and JCC_RE.match(lines[i + 1]):
            run += 1
            best = max(best, run)
            i += 2
        else:
            run = 0
            i += 1
    return best


def test_no_long_title_compare_chain():
    assert longest_run(SRC.read_text(encoding="utf-8").splitlines()) < 10


def test_detector_sees_a_chain():
    fake = []
    for g in EXPECTED_ORDER[:12]:
        fake += [f"        cmp     word [gamep], game_{g}", "        je      .x"]
    assert longest_run(fake) == 12


def test_title_label_order():
    labels = [m.group(1)[5:] for m in LABEL_RE.finditer(SRC.read_text(encoding="utf-8"))]
    assert labels == EXPECTED_ORDER


def test_party_game_helper_is_used():
    text = SRC.read_text(encoding="utf-8")
    assert "party_game:" in text
    assert text.count("call    party_game") >= 5


def _nasm():
    return shutil.which("nasm") or (str(NASM_FALLBACK) if NASM_FALLBACK.is_file() else None)


def _assemble(src_dir, name="gbboot.asm"):
    out = Path(src_dir) / "out.com"
    return subprocess.run([_nasm(), "-f", "bin", "-I", str(src_dir) + "/", str(Path(src_dir) / name), "-o", str(out)],
                          capture_output=True, text=True)


def test_reordered_titles_fail_the_build():
    if not _nasm():
        pytest.skip("NASM unavailable")
    with tempfile.TemporaryDirectory() as td:
        d = Path(td) / "src"
        shutil.copytree(ROOT / "native" / "src", d)
        assert _assemble(d).returncode == 0  # control: unmodified source assembles
        f = d / "gbboot.asm"
        t = f.read_text(encoding="utf-8")
        a = re.search(r"^game_cok\s+db .*$", t, re.M).group(0)
        pool = re.search(r"^game_pool\s+db .*\n", t, re.M).group(0)
        t = t.replace(pool, "", 1)
        t = t.replace(a, pool + a, 1)
        f.write_text(t, encoding="utf-8")
        r = _assemble(d)
        assert r.returncode != 0, "assembler accepted reordered game_* labels"
