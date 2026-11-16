"""CCCOMBAT's 32 KB DAX/HLIB scratch (`daxbuf`) must live in its own DOS block.

The buffer used to be `daxbuf times DAX_FILEMAX db 0` inside the .COM image.
It is now a separate AH=48h block addressed through FS, so the image no longer
carries 32,768 emitted bytes.  Source-level contract (no DOSBox needed):

* no emitted `daxbuf` storage, `daxbuf` is an offset equate;
* the block is obtained with AH=4Ah + AH=48h and FS is loaded from it;
* every memory reference to the buffer goes through an FS override, and every
  DOS read into it goes through `dax_int21` (DS swapped to FS);
* the seven buffer-walking routines also use FS for implicit string sources;
* a fresh engine build measures CCCOMBAT headroom at least 16,000 bytes;
  a source-fresh single-target manifest is not evidence for an absent tool.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest
from test_native_capacity_claims import capacity_manifest  # noqa: F401 -- shared build fixture

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "native" / "src" / "cccombat.asm"
BUFFER_WALKERS = {
    "dax_get_mon_record", "glb_get_mon_record", "byteswap_hlib_ptrs",
    "glb_raw_to_monraw", "glb_rle_to_monraw", "hlib_rle_to_monraw", "dax_rle_to_monraw",
}


def _lines(text: str | None = None) -> list[str]:
    return (text if text is not None else SRC.read_text(encoding="utf-8")).splitlines()


def violations(text: str | None = None) -> list[str]:
    """Return every contract violation found in the assembly text."""
    lines = _lines(text)
    body = "\n".join(lines)
    found: list[str] = []
    if re.search(r"^daxbuf\s+(times|resb|db)\b", body, re.M):
        found.append("daxbuf is emitted storage again")
    if not re.search(r"^daxbuf\s+equ\s+0\b", body, re.M):
        found.append("daxbuf is not an offset equate")
    for needle in ("mov     ah, 4Ah", "mov     ah, 48h", "mov     fs, ax", "dax_int21:"):
        if needle not in body:
            found.append(f"missing {needle!r}")
    code = [re.sub(r";.*", "", l) for l in lines]
    routine = ""
    for i, l in enumerate(code, 1):
        label = re.match(r"^([A-Za-z_]\w*):", l)
        if label:
            routine = label[1]
        if re.search(r"\[daxbuf", l):
            found.append(f"line {i}: [daxbuf without fs: override: {l.strip()}")
        m = re.match(r"\s+mov\s+dx,\s*daxbuf", l)
        if m:
            nxt = [x.strip() for x in code[i:i + 4] if x.strip()]
            if "call    dax_int21".split() != (nxt[-1].split() if nxt and nxt[-1].startswith("call") else []) \
                    and not any(x.startswith("call    dax_int21") or x.startswith("call dax_int21") for x in nxt):
                found.append(f"line {i}: DOS read into daxbuf not via dax_int21")
        # In these routines SI exclusively addresses the DOS scratch block.
        # Keep checking through local labels and loops, including destination
        # writes in byteswap_hlib_ptrs and MOVS' implicit source operand.
        if routine in BUFFER_WALKERS:
            for operand in re.findall(r"\[([^]]+)\]", l):
                if re.search(r"\bsi\b", operand, re.I) and not re.match(r"\s*fs\s*:", operand, re.I):
                    found.append(f"line {i}: {routine} SI operand without fs: {operand}")
            if re.search(r"\b(?:lods[bwd]?|movs[bwd]?)\b", l, re.I) and not re.search(r"\bfs\b", l, re.I):
                found.append(f"line {i}: {routine} implicit buffer source without fs")
    return found


def test_source_contract_holds() -> None:
    assert violations() == []


def test_checker_detects_each_mutation() -> None:
    text = SRC.read_text(encoding="utf-8")
    assert violations(text) == []
    # One dropped segment override in the HLIB header walk.
    mutated = text.replace("cmp     word [fs:daxbuf+12], 'DA'", "cmp     word [daxbuf+12], 'DA'", 1)
    assert mutated != text and violations(mutated)
    # Storage put back into the image.
    mutated = text.replace("daxbuf equ 0 ", "daxbuf    times DAX_FILEMAX db 0 ;", 1)
    assert mutated != text and violations(mutated)
    # A DOS read straight into the buffer.
    mutated = text.replace("call    dax_int21", "int     21h", 1)
    assert mutated != text and violations(mutated)


def _fs_sites() -> list[int]:
    return [i for i, line in enumerate(_lines())
            if re.search(r"\bfs\s*:", line.split(";", 1)[0])
            or re.search(r"\bfs\s+(?:rep\s+)?(?:movs|lods)[bwd]?\b", line.split(";", 1)[0])]


@pytest.mark.parametrize("site", _fs_sites(), ids=lambda i: f"line-{i + 1}")
def test_every_buffer_segment_override_is_required(site: int) -> None:
    lines = _lines()
    assert violations("\n".join(lines)) == []
    original = lines[site]
    lines[site] = re.sub(r"\bfs\s*:\s*|\bfs\s+(?=(?:rep\s+)?(?:movs|lods))", "", original, count=1)
    assert lines[site] != original
    errors = violations("\n".join(lines))
    assert len(errors) == 1 and errors[0].startswith(f"line {site + 1}:"), (
        f"segment mutation must fail at its own instruction: {original}: {errors}"
    )


def test_buffer_walkers_are_live_and_covered() -> None:
    body = SRC.read_text(encoding="utf-8")
    for routine in BUFFER_WALKERS:
        match = re.search(rf"^{routine}:\n(.*?)(?=^[A-Za-z_]\w*:|\Z)", body, re.M | re.S)
        assert match, routine
        assert re.search(r"mov\s+si,\s*daxbuf\b", match[1]), routine
    assert _fs_sites(), "segment mutation controls must not be empty"


def test_raw_copy_rejects_implicit_ds_source() -> None:
    body = SRC.read_text(encoding="utf-8")
    mutated = body.replace("fs rep  movsb", "rep     movsb", 1)
    assert mutated != body
    assert any("glb_raw_to_monraw implicit buffer source" in error for error in violations(mutated))


def _native_source_hash() -> str:
    root = ROOT / "native" / "src"
    lines = []
    for p in sorted(root.rglob("*"), key=lambda p: p.relative_to(root).as_posix().lower()):
        if p.is_file():
            lines.append(f"{p.relative_to(root).as_posix()}={hashlib.sha256(p.read_bytes()).hexdigest()}")
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def cccombat_capacity(data: dict, source_hash: str) -> dict:
    if data.get("native_source_sha256") != source_hash:
        raise ValueError("stale native-capacity source")
    matching = [tool for tool in data["tools"] if tool["tool"] == "cccombat"]
    if len(matching) != 1:
        raise ValueError("native-capacity manifest does not cover cccombat exactly once")
    return matching[0]


def test_cccombat_headroom_from_current_build(capacity_manifest: dict) -> None:
    tool = cccombat_capacity(capacity_manifest, _native_source_hash())
    assert tool["headroom_bytes"] >= 16000, tool


def test_capacity_lookup_distinguishes_partial_and_stale_manifests() -> None:
    partial = {"native_source_sha256": "current", "tools": [{"tool": "ccecl"}]}
    with pytest.raises(ValueError, match="does not cover cccombat"):
        cccombat_capacity(partial, "current")
    stale = {"native_source_sha256": "old", "tools": [{"tool": "cccombat"}]}
    with pytest.raises(ValueError, match="stale native-capacity source"):
        cccombat_capacity(stale, "current")
    complete = {"native_source_sha256": "current", "tools": [{"tool": "cccombat", "headroom_bytes": 33040}]}
    assert cccombat_capacity(complete, "current")["headroom_bytes"] == 33040
