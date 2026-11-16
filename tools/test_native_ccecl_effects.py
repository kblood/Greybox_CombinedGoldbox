r"""Gate native/ccecl-effects-test.ps1 -- the CCECL /E effects + COMBAT resume
+ deterministic-opcode smoke -- from pnpm test:corpus.

WHY THIS EXISTS
---------------------------------------------------------------------------
native/ccecl-effects-test.ps1 was RED on HEAD from 2026-09-10 03:15 until it
was repaired, and NOTHING in this repo could report it. It lives in
native/test.ps1's `$scripts` array, not its `$flowScripts` array, so it fell
between every instrument:

  * native/run-flow-suite.ps1 sweeps only $flowScripts, so
    native/flow-status.json holds no verdict for it at all;
  * tools/test_native_gate_coverage.py derives the tools/-gated set and the
    $flowScripts set, and this script was in neither;
  * native/test.ps1 itself first-failure-aborts and never checks
    $LASTEXITCODE, so a red script there stops the run rather than reporting.

That is the third documented instance of one shape in this repo: e3ce79f
(2026-07-28) re-pinned a monster count in two sibling scripts and missed two
others; f015c0e (2026-09-10) re-pinned an ARGC in gbnwn-flow-test.ps1 and
missed this script. Both misses were scripts in no sweep. This file closes
that hole the same way the eight tools/test_cok_native_*.py files close
theirs: by subprocess-running the script under pytest and asserting a real
PASS string, so `pnpm test:corpus` is the standing gate.

WHY THE ASSERTIONS ARE NON-TRIVIAL
---------------------------------------------------------------------------
native/ccecl-effects-test.ps1 sets `$ErrorActionPreference = "Stop"`, carries
52 `throw` statements, and has exactly one try/catch in the whole file -- a
`try { $p.Kill() } catch {}` process-teardown guard, which swallows no
assertion. Its three `RESULT: ... PASS` lines are the LAST three lines of the
file, so they are reachable only if all 52 throws hold. Asserting on those
three strings therefore asserts the whole script, not a banner: this is NOT
the `zero-exit-without-verdict` shape that native/run-flow-suite.ps1's
classifier exists to catch.

WHAT THE SCRIPT ACTUALLY TOUCHES (measured 2026-09-10)
---------------------------------------------------------------------------
It builds CCECL.COM via native/build.ps1, writes 113 synthetic fixtures into
native/build/ccecl-effects-test/, and launches the retail DOSBox binary ONCE
against a conf that mounts C: at that build directory. It reads NO retail
game data -- `The Dark Queen of Krynn\DOSBOX\DOSBox.exe` is the only retail
path it names -- and it mounts no retail folder, so New-RetailStage is not
required here. A before/after listing (name, length, LastWriteTimeUtc,
container flag) over all three retail game folders across a run showed ZERO
file-level changes and exactly one directory mtime move, on
`The Dark Queen of Krynn\DOSBOX` itself: the already-isolated retail-DOSBox-
binary signature documented in CLAUDE.md, reproducible by running that binary
alone, and not this script's staging.

COST AND STABILITY (measured 2026-09-10, this machine)
---------------------------------------------------------------------------
Four runs: 5.0s, 4.65s, 4.65s, and one more inside the retail-write probe.
Runs 1-3 produced BYTE-IDENTICAL 38-line stdout. So this adds ~5s to a
~9-minute `pnpm test:corpus`, and showed no run-to-run variation. The
`timeout=300` below is a wide margin over that, sized for a cold NASM build,
not for the observed cost.

GUARDS
---------------------------------------------------------------------------
The retail DOSBox binary and `pwsh` are never-vendored external
prerequisites, so their absence SKIPS, matching the convention the rest of
tools/ follows -- and matching the eight existing gated tests exactly.

But the script's own existence is NOT an external prerequisite, so it is
asserted BEFORE the skip guards. This repo has been bitten by tests that can
skip themselves into a green (see CLAUDE.md's
"probes must be able to fail"): without this assertion, deleting
native/ccecl-effects-test.ps1 on a machine lacking DOSBox would be a silent
pass instead of a failure. With it, deletion is RED everywhere.
"""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'native/ccecl-effects-test.ps1'


def test_ccecl_effects_smoke_under_dosbox():
    # Asserted, not skipped: the script is repo content, not an external
    # prerequisite. A missing script must be red on every machine.
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists():
        pytest.skip('held DOSBox unavailable')
    if not shutil.which('pwsh'):
        pytest.skip('PowerShell unavailable')
    # The path below is spelled as a LITERAL inside the subprocess call, not
    # passed as `str(SCRIPT)`, and that is load-bearing rather than sloppy:
    # tools/test_native_gate_coverage.py derives the gated set by AST-scanning
    # every tools/*.py for a literal 'native/<name>.ps1' string constant
    # *inside* a subprocess invocation, and deliberately does not follow
    # variables. Written as str(SCRIPT) this file runs and asserts exactly the
    # same things, but the coverage guard cannot attribute it to a script, so
    # it counts as gating nothing and the disjointness check would not see it.
    # That was measured, not assumed: with str(SCRIPT) the guard reported the
    # gated set as the unchanged known eight.
    assert SCRIPT == ROOT/'native/ccecl-effects-test.ps1'
    result = subprocess.run(['pwsh', '-NoProfile', '-File',
                             str(ROOT/'native/ccecl-effects-test.ps1')],
                            cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stdout+result.stderr
    # All three are the final three lines of a 1754-line script guarded by 52
    # throws under -ErrorActionPreference Stop; each is reachable only if
    # every preceding assertion held.
    assert 'RESULT: CCECL /E raw+DAX+chain+HLIB/GLIB-chain effects smoke PASS' in result.stdout
    assert 'RESULT: CCECL COMBAT resume smoke PASS' in result.stdout
    assert 'RESULT: CCECL deterministic opcode smoke PASS' in result.stdout
