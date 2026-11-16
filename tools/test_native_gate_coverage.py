"""Mechanical guard: tools/-gated native/*.ps1 scripts vs native/test.ps1's
$flowScripts sweep must stay disjoint, and the gated set must never go empty.

WHY THIS EXISTS (CLAUDE.md, "STATED GAP" section, corrected 2026-09-10)
-------------------------------------------------------------------------
That section used to say, as a live current-state claim: "no standing gate
RUNS a native flow script" and "treat the native track as ungated by
construction". Both were FALSE in the direction that hides real coverage:
eight tools/test_cok_native_*.py / test_cok_combat_rng_native.py files each
`subprocess.run` a distinct native/*.ps1 script under pytest, guarded only by
(retail DOSBox.exe present) and (pwsh on PATH) -- not a vacuous always-skip --
and `pnpm test:corpus` runs all of tools/, so those 8 scripts genuinely run,
launch the retail DOSBox binary, and assert real PASS strings.

The corrected statement in CLAUDE.md is narrower on purpose: "no standing gate
runs the $flowScripts sweep; a disjoint set of 8 native DOSBox flow
scripts IS run by pnpm test:corpus." Measured 2026-09-10:
    gated set   (derived from tools/*.py):          8 scripts   <- SUPERSEDED
    flowScripts (derived from native/test.ps1):     30 scripts
    overlap:                                         0

The gated figure above, and the quoted CLAUDE.md sentence just before it, were
correct when written and stopped being correct hours later. Both now read 9;
see the dated UPDATE below. They are left standing rather than edited away
because the paragraph immediately after them says the figures are DERIVED on
every run and never asserted from the comment -- which is exactly why a stale
number here could sit unchallenged, and worth seeing rather than tidying.

Both figures are DERIVED on every run, never asserted from this comment. The
flowScripts figure was 28 until 2026-09-10, when ccecl-dok-b51-watch-test.ps1
and cgb-gbim-test.ps1 -- previously in ZERO runners -- were enrolled. Re-derive
it rather than quoting this line; that is this repo's standing rule about
denominators, and a sweep count taken after that edit must not be compared
against a 28-script baseline.

This test DERIVES both sets from source on every run instead of hard-coding
them, because this repo has repeatedly been bitten by a hand-copied parallel
list drifting from the thing it mirrors (native/run-flow-suite.ps1 itself
AST-parses $flowScripts out of native/test.ps1 for exactly this reason, per
that file's own comments). It is pure static analysis over source text/ASTs:
it never launches DOSBox or pwsh, so it is safe and fast to run alongside
anything else in tools/.

UPDATE 2026-09-10 (later the same day): the gated figure is now NINE, not
eight. tools/test_native_ccecl_effects.py was added to gate
native/ccecl-effects-test.ps1, which had been RED on HEAD from 03:15 that
morning with nothing in the repo able to report it -- it sits in
native/test.ps1's `$scripts` array, not `$flowScripts`, so the sweep held no
verdict for it and this guard's derivation did not reach it either. Re-derive
this count rather than quoting it; CLAUDE.md's "STATED GAP" section still
says 8 in its corrected paragraph and in the sentence quoted above, and needs
the same update.

    gated set   (derived from tools/*.py):          9 scripts
    flowScripts (derived from native/test.ps1):    30 scripts
    overlap:                                        0

THE DERIVATION HAS A BLIND SPOT, AND WRITING GATE #9 IS WHAT FOUND IT
-------------------------------------------------------------------------
find_gated_native_scripts() matches a literal 'native/<name>.ps1' string
constant *inside* a subprocess invocation. It deliberately does not follow
variables -- so a gate written the natural way, hoisting the path to a
module-level constant and passing str(SCRIPT), RUNS AND ASSERTS CORRECTLY
while this guard attributes it to no script at all. It counts as gating
nothing, and the disjointness check never sees it.

That was MEASURED, not reasoned about: the first draft of
tools/test_native_ccecl_effects.py passed str(SCRIPT), its own test passed,
and this guard reported the gated set as the unchanged known eight. The fix
was to spell the path as a literal at the call site and assert the module
constant equals it, so the two cannot drift apart silently.

Note the shape, because it is this file's own failure mode turned inward.
This guard exists so the gated set cannot silently go empty or overlap --
and it is blind to a gate added in the obvious style, in the direction that
reads as safe: a real gate looks like no gate. A maintainer adding #10 sees
the count unchanged and concludes their file did not take effect, or does not
look. Either use a literal at the call site, or teach this function to
resolve module-level constants.

WHAT WOULD TURN THIS RED, AND WHY THAT IS THE POINT
-------------------------------------------------------------------------
- The gated set becomes empty (every tools/*.py subprocess-invocation of a
  native/*.ps1 script disappears) -- this is exactly what would make
  CLAUDE.md's retracted "no standing gate RUNS a native flow script" true
  again, so it must be loud, not silent.
- The gated set and $flowScripts stop being disjoint -- this is exactly what
  would make the corrected claim's "disjoint set of 8" half false.

UPDATE 2026-09-15: THE SET IS TEN, AND ONLY NINE OF THEM ARE BEHAVIOUR
-------------------------------------------------------------------------
tools/test_native_capacity_claims.py joined the derived set by
subprocess-running `native/build.ps1 -Target engine` and asserting the
GBBOOT/CCCOMBAT/CCECL free-byte claims in GOAL.md, native/README.md and
docs/engine/NATIVE-TASKS-2026-09-12.md against the manifest that build emits.
The derivation is working exactly as specified -- a literal 'native/build.ps1'
inside a subprocess call -- so the raw count is now 10.

But the SENTENCE this guard backs in CLAUDE.md says "a disjoint set of N
native DOSBox flow scripts IS run by pnpm test:corpus", and build.ps1 is not
one: it is NASM over native/src plus a capacity manifest, it launches no
DOSBox (its `-Run` switch, which would, is not passed), and it asserts nothing
about gameplay. Letting it raise that N from 9 to 10 would inflate a
BEHAVIOUR-coverage figure with a build step -- the same class of error this
file's header already documents in the other direction.

Two fixes were available and the narrower-looking one is the wrong one.
NARROWING find_gated_native_scripts() to match only 'native/*-test.ps1' would
have restored the count for free, and would have re-opened this file's own
documented blind spot in the direction that reads as safe: a gate whose script
is not named `*-test.ps1` would then be invisible, counted as gating nothing,
and excluded from the disjointness check -- a real gate looking like no gate,
which is precisely the failure that produced gate #9's header note. The
derivation stays broad. What is narrowed is the CLAIM: the full derived set is
still pinned (so any addition of either kind is a named diff), and a declared
NON_FLOW_GATED_SCRIPTS classification separates build/infrastructure scripts
from the flow-behaviour gates that CLAUDE.md's number describes.

Three consequences worth stating, because each is a check that can now fail:
  * test_gated_flow_set_is_nonempty now measures the FLOW set, not the raw
    set. Under the old test, deleting all nine DOSBox gates while keeping the
    build.ps1 invocation would have stayed GREEN with zero native behaviour
    gated -- coverage that is not coverage. That hole is closed.
  * an exemption must be LIVE: every NON_FLOW_GATED_SCRIPTS entry has to
    appear in the derived set, so the classification cannot rot into a list of
    scripts nobody invokes, and cannot be pre-seeded to hide a future gate.
  * an exemption may not name a '*-test.ps1' script, so this mechanism cannot
    be used to shrink the denominator by reclassifying a real flow gate.

COST, MEASURED 2026-09-15 (this machine): `pwsh -NoProfile -File
native/build.ps1 -Target engine` = 3 s wall, rc 0, 16 .COM targets + the
manifest. That is ~0.5% of the ~9-minute corpus gate, and it is not even new
work: native/ccecl-effects-test.ps1 -- gate #9, already standing -- invokes
native/build.ps1 internally from PowerShell, where this AST scan cannot see
it. The capacity test made an already-running build VISIBLE to the derivation;
it did not add a rebuild to the corpus. No narrowing of that test is warranted
on cost grounds.
"""
from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path
from typing import Dict, List

REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"
NATIVE_TEST_PS1 = REPO_ROOT / "native" / "test.ps1"

# A string literal that names a native/*.ps1 script, forward- or back-slash.
_NATIVE_PS1_RE = re.compile(r"^native[\\/]([A-Za-z0-9_.\-]+\.ps1)$")

_SUBPROCESS_INVOKERS = {"run", "Popen", "call", "check_call", "check_output"}

# Scripts that this scan legitimately finds, but that are NOT native DOSBox
# flow/behaviour gates -- build or infrastructure steps a tools/ test drives.
# Keyed by script filename, valued by the reason, so the classification has to
# be argued in place rather than accumulating silently. Three rules below keep
# this from becoming a hiding place: an entry must actually be derived (no
# stale exemptions), must not be a $flowScripts member, and must not be named
# '*-test.ps1' (so a real flow gate cannot be reclassified out of the count).
NON_FLOW_GATED_SCRIPTS = {
    "build.ps1": (
        "NASM assembly of native/src + the native-capacity.json manifest, "
        "driven by tools/test_native_capacity_claims.py to bind the "
        "GBBOOT/CCCOMBAT/CCECL free-byte claims in GOAL.md, native/README.md "
        "and docs/engine/NATIVE-TASKS-2026-09-12.md to an assembled tree. It "
        "launches no DOSBox (-Run is not passed) and asserts nothing about "
        "gameplay, so it is real coverage of a different kind and must not be "
        "counted as behaviour coverage in docs/engine/ORCHESTRATION.md."
    ),
}


def _is_subprocess_call(node: ast.Call) -> bool:
    """True for `subprocess.run(...)`-shaped calls, or a bare `run(...)` /
    `Popen(...)` reached via `from subprocess import run`. Permissive on
    purpose (it does not verify the attribute's value is literally the
    `subprocess` module) -- a false positive here can only ever add a
    non-.ps1 string to the scan, which the filename regex then discards.
    """
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr in _SUBPROCESS_INVOKERS:
        return True
    if isinstance(func, ast.Name) and func.id in _SUBPROCESS_INVOKERS:
        return True
    return False


def _string_constants(node: ast.AST):
    for child in ast.walk(node):
        if isinstance(child, ast.Constant) and isinstance(child.value, str):
            yield child.value


def find_gated_native_scripts(
    tools_dir: Path = None, overrides: Dict[str, str] = None
) -> Dict[str, List[str]]:
    """Scan every tools/*.py file's AST for a subprocess invocation whose
    argument list contains a literal 'native/<name>.ps1' (or backslash)
    string constant -- the pattern all ten known gated invocations use, e.g.
    `subprocess.run(['pwsh', '-NoProfile', '-File',
                      str(ROOT/'native/cokrng-test.ps1')], ...)`.

    A script referenced only through a variable (e.g. `RUNNER` built up
    elsewhere and passed as `str(RUNNER)`) is deliberately NOT counted here:
    it is not a literal invocation this AST scan can attribute to a specific
    script, and in the one real instance of that shape in this repo
    (test_native_flow_status.py's `-SelfTestDirProbe` call against
    native/run-flow-suite.ps1, the meta-runner, not a $flowScripts member)
    that is the correct answer.

    Returns {script_filename: [relative .py paths that invoke it]}.

    ``tools_dir`` (default: this repo's tools/) and ``overrides`` (a mapping
    of "tools/<name>.py" -> replacement source) let tools/native_test_ownership.py
    reuse this exact derivation against another root or a mutated gate file.
    """
    tools_dir = TOOLS_DIR if tools_dir is None else tools_dir
    hits: Dict[str, List[str]] = {}
    for py_file in sorted(tools_dir.glob("*.py")):
        key = f"tools/{py_file.name}"
        try:
            if overrides is not None and key in overrides:
                source = overrides[key]
            else:
                source = py_file.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        try:
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not _is_subprocess_call(node):
                continue
            for s in _string_constants(node):
                m = _NATIVE_PS1_RE.match(s.replace("\\", "/"))
                if m:
                    hits.setdefault(m.group(1), []).append(
                        str(py_file.relative_to(tools_dir.parent))
                    )
    return hits


def parse_flow_scripts() -> List[str]:
    """Balanced-paren scan of native/test.ps1's `$flowScripts = @( ... )`
    array. Deliberately not a hand-copied list -- this repo has twice been
    bitten by exactly that, which is also why native/run-flow-suite.ps1
    AST-parses this same array instead of maintaining its own copy.
    """
    text = NATIVE_TEST_PS1.read_text(encoding="utf-8")
    m = re.search(r"\$flowScripts\s*=\s*@\(", text)
    if not m:
        raise AssertionError(f"could not find '$flowScripts = @(' in {NATIVE_TEST_PS1}")
    start = text.index("(", m.start())
    depth = 0
    end = None
    for i in range(start, len(text)):
        c = text[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        raise AssertionError(f"unbalanced parens scanning $flowScripts in {NATIVE_TEST_PS1}")
    segment = text[start + 1:end]
    names = re.findall(r'"([^"]+\.ps1)"|\'([^\']+\.ps1)\'', segment)
    return [a or b for a, b in names]


def split_gated_sets(gated):
    """Partition derived script names into (flow_gates, non_flow_gates).

    Pure and side-effect free so the classification itself can be tested on
    synthetic input -- this repo's standing rule is that a predicate nobody
    has seen fail is not evidence.
    """
    names = set(gated)
    non_flow = {n for n in names if n in NON_FLOW_GATED_SCRIPTS}
    return names - non_flow, non_flow


class NativeGateCoverageTests(unittest.TestCase):
    def test_flowscripts_array_is_nonempty_and_parses(self) -> None:
        flow = parse_flow_scripts()
        self.assertGreater(
            len(flow), 0,
            f"parsed zero entries out of $flowScripts in {NATIVE_TEST_PS1} -- "
            "the balanced-paren scan probably broke, not that the array emptied",
        )
        for name in flow:
            # Every entry should be a bare filename, not a path -- catches a
            # scan that swallowed a neighbouring construct by mistake.
            self.assertNotIn("/", name, f"{name!r} looks like a path, not a bare script name")
            self.assertNotIn("\\", name, f"{name!r} looks like a path, not a bare script name")

    def test_gated_flow_set_is_nonempty(self) -> None:
        """The mechanical version of "a standing gate DOES run native flow
        scripts". Measured over the FLOW set, not the raw derived set --
        changed 2026-09-15, and that change is the substantive one in the
        edit. Raw-set nonemptiness could be satisfied by the build.ps1
        invocation alone, so deleting all nine tools/ DOSBox gates would have
        left this GREEN while zero native behaviour was gated: coverage that
        is not coverage, in the direction that reads as safe. Over the flow
        set, that deletion is red.
        """
        flow_gates, _ = split_gated_sets(find_gated_native_scripts())
        self.assertGreater(
            len(flow_gates), 0,
            "no tools/*.py file subprocess-invokes any native DOSBox flow "
            "script -- either the known gated scripts were removed (re-open "
            "docs/engine/ORCHESTRATION.md's 'Native flow-gate coverage' section), or this "
            "scanner broke and needs fixing, not the old claim restored",
        )

    def test_gated_scripts_disjoint_from_flowscripts_sweep(self) -> None:
        """The other half of the docs/engine/ORCHESTRATION.md coverage claim:
        the gated set and the $flowScripts sweep must never overlap. An
        overlap would mean a script this file counts as 'gated by pnpm
        test:corpus' is also a member of the (still ungated) sweep,
        invalidating the shared statement's "disjoint" wording. Deliberately
        measured over the RAW set, non-flow entries included: a build/infrastructure script turning
        up in $flowScripts would be just as much a contradiction.
        """
        gated = set(find_gated_native_scripts())
        flow = set(parse_flow_scripts())
        overlap = gated & flow
        self.assertEqual(
            set(), overlap,
            f"native/*.ps1 scripts both subprocess-gated by tools/ AND listed "
            f"in native/test.ps1's $flowScripts: {sorted(overlap)} -- "
            "docs/engine/ORCHESTRATION.md's 'Native flow-gate coverage' section's disjointness "
            "claim needs re-deriving",
        )

    def test_known_gated_scripts_are_exactly_the_gated_set(self) -> None:
        """Pinned to the 2026-09-15 measurement so an addition or removal is
        visible as a named diff here, not only as a changed count. Unlike the
        tests above, this one is not itself the safety property -- it is the
        paper trail, and it covers BOTH classes, so adding an infrastructure
        invocation is as visible as adding a flow gate. If it goes red because
        a script was legitimately added or removed, update this set, its
        classification, AND the docs/engine/ORCHESTRATION.md coverage statement
        together; do not just widen the assertion to make it pass.
        """
        gated = find_gated_native_scripts()
        expected_flow_gates = {
            "ccecl-ack-resume-test.ps1",
            # Added 2026-10-02: the largest GBMR header must exercise the
            # complete producer/commit/continuation path in the standing corpus.
            "cokcommit-test.ps1",
            "cokhost-test.ps1",
            "cokmutation-test.ps1",
            "cokremove-test.ps1",
            "cokrng-test.ps1",
            "cokstats-test.ps1",
            "cokyield-test.ps1",
            "cokability-test.ps1",
            "cokcombat-rng-test.ps1",
            # Added 2026-09-10 by tools/test_native_ccecl_effects.py. This is
            # the FIRST gated script that is not a `cok*-test.ps1`, and the
            # first drawn from native/test.ps1's `$scripts` array rather than
            # from no runner at all -- so the gated set is no longer
            # describable as "the eight tools/test_cok_native_*.py files".
            "ccecl-effects-test.ps1",
        }
        # Added 2026-09-15 by tools/test_native_capacity_claims.py: a build
        # step, not a DOSBox flow, hence the separate bucket. See
        # NON_FLOW_GATED_SCRIPTS and this module's 2026-09-15 header note.
        expected_non_flow = set(NON_FLOW_GATED_SCRIPTS)
        self.assertEqual(
            expected_flow_gates | expected_non_flow, set(gated),
            "the gated-script set has changed -- review docs/engine/ORCHESTRATION.md's "
            "coverage statement, and update the classification above and this "
            "expectation together",
        )
        flow_gates, non_flow = split_gated_sets(gated)
        self.assertEqual(expected_flow_gates, flow_gates)
        self.assertEqual(expected_non_flow, non_flow)

    def test_non_flow_exemptions_are_live_and_cannot_hide_a_flow_gate(self) -> None:
        """An exemption list is a denominator-shrinking mechanism, so it gets
        its own constraints (added 2026-09-15):

        (a) every entry must actually be derived from source -- a
            classification for a script no tools/ test invokes is stale, and
            worse, could be pre-seeded so a future gate is born exempt;
        (b) no entry may be named '*-test.ps1', so a genuine flow gate cannot
            be reclassified out of docs/engine/ORCHESTRATION.md's behaviour coverage;
        (c) every entry must carry a non-trivial written reason.
        """
        derived = set(find_gated_native_scripts())
        for name, reason in NON_FLOW_GATED_SCRIPTS.items():
            self.assertIn(
                name, derived,
                f"{name} is classified as a non-flow gated script but no "
                "tools/*.py subprocess-invokes it -- a stale exemption; "
                "delete the entry rather than leaving it able to exempt a "
                "future script silently",
            )
            self.assertFalse(
                name.endswith("-test.ps1"),
                f"{name} is named like a flow-test script; exempting it would "
                "shrink docs/engine/ORCHESTRATION.md's behaviour coverage by reclassification",
            )
            self.assertGreater(
                len(reason.strip()), 40,
                f"{name}'s exemption reason is too short to be an argument",
            )


class ClassificationSelfTests(unittest.TestCase):
    """Synthetic proofs that split_gated_sets() discriminates, because a
    predicate nobody has seen fail is not evidence (CLAUDE.md, "probes must be
    able to fail"). These use fabricated inputs and touch no repo state.
    """

    def test_a_non_flow_name_is_not_counted_as_a_flow_gate(self) -> None:
        flow, non_flow = split_gated_sets({"build.ps1", "cokrng-test.ps1"})
        self.assertEqual({"cokrng-test.ps1"}, flow)
        self.assertEqual({"build.ps1"}, non_flow)

    def test_a_raw_set_of_only_non_flow_scripts_yields_zero_flow_gates(self) -> None:
        """The exact condition test_gated_flow_set_is_nonempty now catches and
        the old raw-set version did not.
        """
        flow, non_flow = split_gated_sets({"build.ps1"})
        self.assertEqual(set(), flow)
        self.assertEqual({"build.ps1"}, non_flow)

    def test_an_unclassified_script_defaults_into_the_flow_bucket(self) -> None:
        """Fail-safe direction: an unknown new script counts as a flow gate,
        which makes the pinned-set test go red and forces a human
        classification, instead of being silently exempted.
        """
        flow, non_flow = split_gated_sets({"brand-new-thing.ps1"})
        self.assertEqual({"brand-new-thing.ps1"}, flow)
        self.assertEqual(set(), non_flow)


if __name__ == "__main__":
    unittest.main()
