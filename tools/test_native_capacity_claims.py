"""Keep current native .COM capacity claims bound to an assembled source tree.

SCOPE AND CLASSIFICATION (2026-09-15)
---------------------------------------------------------------------------
This file subprocess-invokes `native/build.ps1 -Target engine`, which makes it
the tenth member of the set tools/test_native_gate_coverage.py derives -- but
the FIRST that is not a native DOSBox flow script. build.ps1 runs NASM over
native/src and emits native/build/native-capacity.json; it launches no DOSBox
(its `-Run` switch is not passed here) and asserts nothing about gameplay.
That guard therefore classifies it under NON_FLOW_GATED_SCRIPTS, so this file
does NOT raise CLAUDE.md's "N native DOSBox flow scripts are gated" figure,
which stays at nine. See that module's 2026-09-15 header note for why the
derivation pattern was left broad and the CLAIM narrowed instead.

COST, MEASURED 2026-09-15 (this machine): the build is 3 s wall, rc 0, 16
.COM targets plus the manifest -- ~0.5% of the ~9-minute corpus gate, and not
new work either way: native/ccecl-effects-test.ps1, a standing gate since
2026-09-10, already invokes native/build.ps1 internally from PowerShell where
an AST scan of tools/ cannot see it. So narrowing this test to avoid the build
would buy nothing measurable and would cost the property the test exists for:
the manifest's native_source_sha256 is checked against a hash re-derived here
from native/src, so a STALE manifest cannot satisfy these claims. Reading a
committed manifest instead of generating one would make every assertion below
a statement about a file rather than about an assembled tree.

PREREQUISITES: pwsh and NASM are never-vendored external toolchain, so their
absence SKIPS, matching the convention the other gated native tests follow.
build.ps1 itself is repo content, not a prerequisite, so its absence is
asserted and cannot be skipped away (CLAUDE.md, "probes must be able to
fail": a test that can skip itself can pass without running).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = REPO_ROOT / "native" / "build" / "native-capacity.json"
CURRENT_CAPACITY = re.compile(
    r"<!-- native-capacity:ccecl emitted=(\d+) resident=(\d+) headroom=(\d+) -->"
)
CURRENT_DOCS = (
    REPO_ROOT / "GOAL.md",
    REPO_ROOT / "native" / "README.md",
    REPO_ROOT / "docs" / "engine" / "NATIVE-TASKS-2026-09-12.md",
)
ACTIVE_TASK_LIST = REPO_ROOT / "docs" / "engine" / "NATIVE-TASKS-2026-09-12.md"
BUILD_SCRIPT = REPO_ROOT / "native" / "build.ps1"
PROSE_NUMBER_RE = re.compile(r"\b\d{1,2},\d{3}\b")
PROSE_HEADROOM_RE = re.compile(r"(\d+) bytes of headroom")
# Non-capacity constants that legitimately appear, comma-formatted, in the
# prose paragraph above a native-capacity:ccecl pin. Anything else in that
# shape must be explained by this allowlist or it is a stale (or new,
# unpinned) capacity figure -- see plan §34.4/§34.6 step 3.
NON_CAPACITY_NUMBER_ALLOWLIST = {
    "65,280": "COM limit",
    "2,244": "retail matrix size",
}
# build.ps1 looks for this install first, then falls back to PATH; mirror
# both so a skip here means NASM really is absent, not merely off PATH.
NASM_FALLBACK = Path.home() / "AppData" / "Local" / "bin" / "NASM" / "nasm.exe"


def _native_source_hash() -> str:
    source_root = REPO_ROOT / "native" / "src"
    lines = []
    for path in sorted(source_root.rglob("*"), key=lambda p: p.relative_to(source_root).as_posix().lower()):
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            lines.append(f"{path.relative_to(source_root).as_posix()}={digest}")
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


@pytest.fixture(scope="module")
def capacity_manifest() -> dict:
    # Asserted, not skipped: build.ps1 is repo content, not an external
    # prerequisite, so its deletion must be red on every machine.
    assert BUILD_SCRIPT.is_file(), f"{BUILD_SCRIPT} is missing -- this gate cannot skip that away"
    if not shutil.which("pwsh"):
        pytest.skip("PowerShell unavailable")
    if not (shutil.which("nasm") or NASM_FALLBACK.is_file()):
        pytest.skip("NASM unavailable")
    # The path is spelled as a literal inside the subprocess call, not passed
    # as str(BUILD_SCRIPT): tools/test_native_gate_coverage.py AST-scans for a
    # literal 'native/<name>.ps1' constant inside a subprocess invocation and
    # deliberately does not follow variables, so a variable here would make
    # this gate invisible to that derivation.
    assert BUILD_SCRIPT == REPO_ROOT / "native" / "build.ps1"
    proc = subprocess.run(
        ["pwsh", "-NoProfile", "-File", "native/build.ps1", "-Target", "engine"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert MANIFEST.is_file(), "native build did not emit native-capacity.json"
    return json.loads(MANIFEST.read_text(encoding="utf-8-sig"))


def test_capacity_manifest_is_source_bound_and_internally_consistent(capacity_manifest: dict) -> None:
    assert capacity_manifest["schema"] == 1
    assert capacity_manifest["native_source_sha256"] == _native_source_hash()
    assert capacity_manifest["com_limit_bytes"] == 65280
    tools = capacity_manifest["tools"]
    assert len(tools) == 17
    assert {tool["tool"] for tool in tools} == {
        "gbboot", "ccparty", "ccinv", "ccecl", "ccflow", "ccbind", "ccefx", "cchost", "ccnext",
        "ccgeo", "ccfp", "cchlib", "cccombat", "ccdaa", "cgb", "ccdemo", "ccmenu",
    }
    for tool in tools:
        assert tool["resident_bytes"] <= capacity_manifest["com_limit_bytes"]
        assert tool["headroom_bytes"] == capacity_manifest["com_limit_bytes"] - tool["resident_bytes"]
        assert tool["emitted_bytes"] > 0


@pytest.mark.parametrize("path", CURRENT_DOCS)
def test_current_ccecl_capacity_claims_match_the_generated_manifest(capacity_manifest: dict, path: Path) -> None:
    ccecl = next(tool for tool in capacity_manifest["tools"] if tool["tool"] == "ccecl")
    match = CURRENT_CAPACITY.search(path.read_text(encoding="utf-8"))
    assert match is not None, f"{path.relative_to(REPO_ROOT)} lacks its current native-capacity:ccecl claim"
    assert tuple(map(int, match.groups())) == (
        ccecl["emitted_bytes"], ccecl["resident_bytes"], ccecl["headroom_bytes"]
    )


def _paragraph_before(text: str, comment_start: int) -> str:
    """The prose paragraph immediately above a capacity pin comment.

    Per plan §34.6 step 3: "That paragraph runs from the previous blank
    line to the comment." A doc with no earlier blank line (e.g. the pin
    sits near the top of the file) uses everything from the start.
    """
    prefix = text[:comment_start]
    blank_boundary = prefix.rfind("\n\n")
    return prefix[blank_boundary + 2:] if blank_boundary != -1 else prefix


@pytest.mark.parametrize("path", CURRENT_DOCS)
def test_current_ccecl_capacity_prose_matches_the_generated_manifest(
    capacity_manifest: dict, path: Path
) -> None:
    """The sentence(s) directly above each native-capacity:ccecl pin must
    themselves agree with the manifest, not only the machine-readable
    comment below them.

    10d (checkpoint 20/21) updated the HTML pin comments but left two
    current-tense prose sentences quoting the previous CCECL figures right
    next to them (GOAL.md, native/README.md) -- see plan §34.4, "One real
    finding: 10d left the capacity prose stale beside the updated pins".
    That drift was invisible to every existing assertion in this file,
    which only reads the `<!-- native-capacity:... -->` comments themselves.
    """
    ccecl = next(tool for tool in capacity_manifest["tools"] if tool["tool"] == "ccecl")
    text = path.read_text(encoding="utf-8")
    match = CURRENT_CAPACITY.search(text)
    assert match is not None, f"{path.relative_to(REPO_ROOT)} lacks its current native-capacity:ccecl claim"
    paragraph = _paragraph_before(text, match.start())

    allowed_numbers = {
        f"{ccecl['emitted_bytes']:,}",
        f"{ccecl['resident_bytes']:,}",
        *NON_CAPACITY_NUMBER_ALLOWLIST,
    }
    found_numbers = PROSE_NUMBER_RE.findall(paragraph)
    unexplained = [n for n in found_numbers if n not in allowed_numbers]
    assert not unexplained, (
        f"{path.relative_to(REPO_ROOT)}: the paragraph above its "
        f"native-capacity:ccecl pin contains number(s) {unexplained} that are "
        f"neither the manifest's current CCECL figures (emitted="
        f"{ccecl['emitted_bytes']:,}, resident={ccecl['resident_bytes']:,}) nor "
        f"in NON_CAPACITY_NUMBER_ALLOWLIST -- it is likely stale prose."
    )

    for headroom_str in PROSE_HEADROOM_RE.findall(paragraph):
        assert int(headroom_str) == ccecl["headroom_bytes"], (
            f"{path.relative_to(REPO_ROOT)}: the paragraph above its "
            f"native-capacity:ccecl pin claims '{headroom_str} bytes of "
            f"headroom', but the manifest says {ccecl['headroom_bytes']}."
        )


@pytest.mark.parametrize("tool_name", ("gbboot", "cccombat"))
def test_active_task_list_capacity_claims_match_the_generated_manifest(
    capacity_manifest: dict, tool_name: str
) -> None:
    """The current constrained-tool numbers must not silently revert to history."""
    tool = next(record for record in capacity_manifest["tools"] if record["tool"] == tool_name)
    pattern = re.compile(
        rf"<!-- native-capacity:{tool_name} emitted=(\d+) resident=(\d+) headroom=(\d+) -->"
    )
    match = pattern.search(ACTIVE_TASK_LIST.read_text(encoding="utf-8"))
    assert match is not None, f"{ACTIVE_TASK_LIST.relative_to(REPO_ROOT)} lacks its current {tool_name} capacity claim"
    assert tuple(map(int, match.groups())) == (
        tool["emitted_bytes"], tool["resident_bytes"], tool["headroom_bytes"]
    )
