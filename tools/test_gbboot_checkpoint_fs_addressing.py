"""GBBOOT keeps its GBCP checkpoint image in its OWN DOS block, addressed through FS.

Design (native/src/gbboot.asm, "GBCP v4 image" comment): the image is not emitted in the .COM; it
lives in a segment allocated directly above the resident image + STACKPAD by `shrink_mem`, so it
costs no resident bytes. Pins, each mutation-tested on a COPY of the source text (never native/src):

* every memory operand naming an image symbol carries an `fs:` override (a DS-relative access would
  silently read resident code instead of the image);
* `start` points FS at cs+IMG_BASE_PARAS and records it in img_seg, and `do_exec` reloads FS from
  img_seg after EXEC (DOS gives no FS guarantee);
* `shrink_mem` requests IMG_BASE_PARAS+IMG_PARAS paragraphs and IMG_BASE_PARAS includes STACKPAD;
* numerically (NASM): IMG_PARAS*16 == 8640, so the request is resident + 1024 + 8640
  (tools/test_gbboot_allocation.py measures the same figure by emulation).
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "native/src/gbboot.asm"
IMAGE_SYMS = ("checkpoint_header", "checkpoint_pose", "rest_fx", "checkpoint_owned_flags",
              "checkpoint_owned_matrix", "checkpoint_timers", "checkpoint_learn")
MIN_FS_ACCESSES = 40


def text_violations(src: str) -> list[str]:
    bad = []
    mem = re.compile(r"\[([^\]]*)\]")
    n_fs = 0
    for no, line in enumerate(src.splitlines(), 1):
        code = line.split(";", 1)[0]
        for m in mem.finditer(code):
            inner = m.group(1).strip()
            if inner.startswith("fs:"):
                if any(re.match(rf"fs:\s*{s}\b", inner) for s in IMAGE_SYMS):
                    n_fs += 1
                continue
            if any(re.match(rf"(cs:|ds:|es:)?\s*{s}\b", inner) for s in IMAGE_SYMS):
                bad.append(f"line {no}: image access without fs: {code.strip()}")
    if n_fs < MIN_FS_ACCESSES:
        bad.append(f"only {n_fs} fs-addressed image accesses (< {MIN_FS_ACCESSES})")
    start = src[src.index("\nstart:\n"):][:400]
    if not re.search(r"add\s+ax,\s*IMG_BASE_PARAS\s*\n\s*mov\s+fs,\s*ax\s*\n\s*mov\s+\[img_seg\],\s*ax", start):
        bad.append("start does not set FS = cs+IMG_BASE_PARAS and img_seg")
    ex = src[src.index("\ndo_exec:\n"):][:1500]
    if not re.search(r"mov\s+fs,\s*\[img_seg\]", ex):
        bad.append("do_exec does not reload FS from img_seg")
    sm = src[src.index("\nshrink_mem:\n"):][:700]
    if not re.search(r"mov\s+bx,\s*IMG_BASE_PARAS\s*\+\s*IMG_PARAS\s*\n(?:.*\n){0,3}?\s*mov\s+ah,\s*4Ah", sm):
        bad.append("shrink_mem does not request IMG_BASE_PARAS+IMG_PARAS")
    if not re.search(r"^IMG_BASE_PARAS equ \(prog_end-\$\$\+100h\+STACKPAD\+15\)/16", src, re.M):
        bad.append("IMG_BASE_PARAS does not cover prog_end + 100h + STACKPAD")
    if not re.search(r"^STACKPAD equ 1024\b", src, re.M):
        bad.append("STACKPAD is not 1024")
    return bad


def image_paras_bytes(src: str, tmp_path: Path) -> int:
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    if not Path(nasm).exists():
        pytest.skip("NASM unavailable")
    asm = tmp_path / "probe.asm"
    asm.write_text(src + "\n%assign pv_paras IMG_PARAS\n%warning PROBE pv_paras\n", encoding="utf-8")
    r = subprocess.run([nasm, "-f", "bin", "-I", str(ROOT / "native/src") + "/", str(asm),
                        "-o", str(tmp_path / "probe.com")], capture_output=True, text=True, check=True)
    return int(re.search(r"PROBE (\d+)", r.stderr).group(1)) * 16


@pytest.fixture(scope="module")
def src() -> str:
    return SRC.read_text(encoding="utf-8")


def test_real_source_satisfies_every_pin(src):
    assert text_violations(src) == []


def test_image_is_8640_bytes_so_request_is_resident_plus_1024_plus_8640(src, tmp_path):
    assert image_paras_bytes(src, tmp_path) == 8640


def _mutations(src: str):
    def once(a, b):
        assert src.count(a) >= 1, a
        return src.replace(a, b, 1)
    yield "drop an fs override", once("[fs:rest_fx+GBEF_CLOCK_OFF+6]", "[rest_fx+GBEF_CLOCK_OFF+6]")
    yield "start forgets img_seg", once("        mov     [img_seg], ax\n", "")
    yield "exec forgets FS reload", once("        mov     fs, [img_seg]           ;", "        nop                     ;")
    yield "shrink_mem drops image", once("mov     bx, IMG_BASE_PARAS+IMG_PARAS", "mov     bx, IMG_BASE_PARAS")
    yield "base drops STACKPAD", once("IMG_BASE_PARAS equ (prog_end-$$+100h+STACKPAD+15)/16",
                                      "IMG_BASE_PARAS equ (prog_end-$$+100h+15)/16")


@pytest.mark.parametrize("idx", range(5))
def test_text_pins_go_red_under_mutation(src, idx):
    name, mutated = list(_mutations(src))[idx]
    assert mutated != src
    assert text_violations(mutated), f"mutation not detected: {name}"


def test_numeric_pin_goes_red_under_mutation(src, tmp_path):
    bigger = src.replace("IMG_SIZE equ IMG_SENTINEL+1", "IMG_SIZE equ IMG_SENTINEL+1+32", 1)
    assert bigger != src
    assert image_paras_bytes(bigger, tmp_path) != 8640
