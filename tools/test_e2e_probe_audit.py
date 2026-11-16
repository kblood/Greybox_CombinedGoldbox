"""Pins for tools/e2e_probe_audit.py -- the standing audit of e2e.mjs browser probes.

Round 30, R5. See tools/e2e_probe_audit.py's module docstring for what each detector claims to
catch and what it explicitly does not. This file pins the CURRENT, MEASURED output of that
module against apps/web/test/e2e.mjs as exact sets -- so a new instance of the "cannot fail"
bug shape (an uncompared optional-chained hook call, a threshold-only guard with no exact pin,
or a harness-local flag standing in for a page.evaluate check) shows up as a red diff here
instead of silently shipping as a fourth round of the same accident.

Phase A pins these sets as MEASURED (not the round plan's predicted numbers -- see the report
for the divergence and why). Phase B, which edits e2e.mjs and is out of this file's scope,
shrinks KNOWN_WEAK_CHECKPOINT_PROBES toward `set()` as each of the five named probes is
strengthened.
"""

from __future__ import annotations

import json
import re
import sys
import textwrap
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import e2e_probe_audit as ea

REPO_ROOT = TOOLS.parent
ROUTES_PATH = REPO_ROOT / "tools/goldbox_corpus_routes.json"


# ---------------------------------------------------------------------------
# Pinned sets, measured on the tree this file ships with.
#
# uncompared_hook_calls() finds 28 individual line occurrences; several functions repeat the
# identical (function, text) shape at more than one call site. The pinned set below is keyed by
# (function, text) -- 18 unique shapes; the 28-vs-18 distinction is measured and reported
# separately, not hidden.
#
# Round 30 Phase B took this from 30/19 to 28/18 by strengthening runFruaHeirsRoute's
# `!window.__combat?.isOverlay?.()` (two call sites, e2e.mjs:15481 and :15495) into an exact
# `typeof window.__combat === "undefined"` comparison.
#
# What REMAINS here is mostly `page.waitForFunction(...)`, and that is a deliberate limit of the
# audit rather than a backlog: a waitForFunction whose condition never holds throws on timeout
# and fails its case, so it is load-bearing even though its value is never compared. The genuinely
# vacuous shape is a bare `page.evaluate(...)` whose result is discarded. The tool does not yet
# separate the two, so this set over-reports; do not "fix" these by deleting the waits.
# ---------------------------------------------------------------------------

KNOWN_UNCOMPARED: frozenset[tuple[str, str]] = frozenset({
    ("drainGatewayWanderingEncounter", "if (!window.__dialogue?.open?.()) return null;"),
    ("driveCokOpeningToTravel", "if (await page.evaluate('!!window.__cokOpeningCamp?.open?.()')) {"),
    ("driveCokOpeningToTravel", "if (await page.evaluate('!!window.__cokTravel?.open?.()')) break;"),
    ("runCoabRegionalTownRoundTrip", "await page.waitForFunction('window.__coabRegional && window.__dialogue?.open?.()', { timeout: 45000 });"),
    ("runCoabRegionalTownRoundTrip", "await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 20000 });"),
    ("runCokRetailTravel", "await page.evaluate('window.__sheet?.close?.()');"),
    ("runExploreCok6LandmarkOutpost", "await page.waitForFunction('window.__cokThrotl && window.__dialogue?.open?.()', { timeout: 45000 });"),
    ("runExploreCok6LandmarkOutpost", "await page.waitForFunction('window.__cokTravel?.open?.()', { timeout: 45000 });"),
    ("runExploreCok6LandmarkOutpost", "await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 45000 });"),
    ("runExplorePoolHolySymbolQuest", "await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 10000 });"),
    ("runExplorePoolHolySymbolQuest", "await page.waitForFunction('window.__poolTravel?.open?.() && window.__dialogue?.open?.()', { timeout: 20000 });"),
    ("runExplorePoolRegionalSectorRoundTrip", "await page.waitForFunction('window.__poolTravel?.open?.() && window.__dialogue?.open?.()', { timeout: 20000 });"),
    ("runExplorePoolRegionalSectorRoundTrip", "if (window.__dialogue?.open?.()) {"),
    ("runExplorePoolsNaturalCombat", "await page.waitForFunction('!window.__dialogue?.open?.()', { timeout: 5000 });"),
    ("runExploreTreasuresNaturalCombat", "!window.__dialogue?.open?.()"),
    ("runGatewayEcl6WildernessBoatAbandon", "await page.waitForFunction(() => window.__explore?.promptInfo?.() == null);"),
    ("runGatewayEcl6WildernessEncounter", "await page.waitForFunction('!window.__dialogue?.open?.()', { timeout: 5000 });"),
    ("runGatewayEcl6WildernessErekExit", "await page.waitForFunction(() => window.__explore?.promptInfo?.() == null);"),
})

# The total number of raw (line-numbered) Hit rows uncompared_hook_calls() returns -- more than
# len(KNOWN_UNCOMPARED) because several functions repeat one shape at several call sites.
KNOWN_UNCOMPARED_TOTAL_OCCURRENCES = 28

# threshold_only_guards() and harness_local_flags() are pinned by count only (their per-line
# text is exercised indirectly through classify_checkpoint_guard() and test 4 below); a
# regression that changes either count is still worth a human look even without a full text pin.
KNOWN_THRESHOLD_ONLY_COUNT = 31
KNOWN_HARNESS_LOCAL_FLAG_COUNT = 1

# The probes the round-30 plan named as weak AND load-bearing (each backs a real capability
# checkpoint or a standalone case). The plan called them "five"; there were in fact SIX -- the
# miscount is recorded rather than quietly corrected, because it is the same class of error the
# audit exists to catch.
#
# Phase B strengthened all six against MEASURED values, so this set is now empty. It exists to be
# emptied, not grown: do NOT add a new probe here to make it pass.
KNOWN_WEAK_CHECKPOINT_PROBES: frozenset[tuple[str, str]] = frozenset()

# The six former weak probes, pinned by their ORIGINAL text. An empty
# KNOWN_WEAK_CHECKPOINT_PROBES would make a presence test vacuous, so the test below inverts it:
# these exact strings must NOT come back. That is falsifiable -- restoring any one of them turns
# the suite red -- where looping over an empty set would assert nothing at all.
FORMER_WEAK_CHECKPOINT_PROBES: frozenset[tuple[str, str]] = frozenset({
    ("driveCokOpeningToTravel", "if (!usedTownService) errors.push('cok-opening-commandant-service-not-used');"),
    ("runEclInspector", "const loadedOk = !!s0 && s0.blockId >= 0 && Array.isArray(lines0) && lines0.length > 0;"),
    ("runEclInspector", "const nextOk = (await page.evaluate('window.__ecl.state().blockId')) >= 0;"),
    ("runFruaHeirsRoute", "await page.evaluate('!window.__combat?.isOverlay?.()');"),
    ("runNwnLibraryGameView", "const pass = matched && visible && routed && rendered >= 0 && errors.length === 0 && bad.length === 0;"),
    ("runExplorePoolHolySymbolQuest", "if (!northeast || !east) errors.push(`pool-symbol-regional-move: NE=${northeast} E=${east}`);"),
})

# Of the six, only two were checkpoint markers in goldbox_corpus_routes.json. After Phase B,
# `cok-opening-commandant-service-not-used` classifies "value-pinning" (it now reads engine word
# 19502 back out of the page instead of a harness-local flag) and is no longer excepted.
#
# `explore-pool-holy-symbol-quest` still classifies "weak", and MEASURING why matters: its own
# regional-move guard was strengthened to pin the party's exact positions ({11,28} -> after leg 1
# -> {13,27}). It stays weak only because it is a shape-2 WHOLE-CASE marker, and shape 2 condemns
# a case if its function contains ANY uncompared hook call anywhere -- here two waitForFunction
# waits, which do fail by timeout. So this entry now records a limitation of the classifier, not a
# surviving vacuous probe. Narrowing shape 2 to exclude waits is left undone deliberately: it is a
# change to what the audit MEANS and belongs in its own round with its own null.
ROUTES_JSON_WEAK_MARKERS = frozenset({
    "explore-pool-holy-symbol-quest",
})


SYNTHETIC_SNIPPET = """
function exampleCase(page) {
  if (window.__x?.y?.() === true) foo();
  if (!!window.__z?.w?.()) bar();
  const included = errors.includes(window.__q?.r?.());
}
"""


def _routes_json_web_markers(routes: dict) -> set[str]:
    markers: set[str] = set()
    for route in routes.get("routes", []):
        checkpoints = route.get("verification", {}).get("checkpoints", {})
        for refs in checkpoints.values():
            for ref in refs:
                if str(ref.get("file", "")).endswith("apps/web/test/e2e.mjs"):
                    markers.add(ref["marker"])
    return markers


class UncomparedHookCallsTests(unittest.TestCase):
    def test_synthetic_null_finds_exactly_one(self):
        """One compared call, one uncompared, one `.includes(...)` -> exactly one hit."""
        hits = ea.uncompared_hook_calls(SYNTHETIC_SNIPPET)
        self.assertEqual(len(hits), 1, msg=[h.text for h in hits])
        self.assertIn("window.__z?.w?.()", hits[0].text)
        self.assertEqual(hits[0].function, "exampleCase")

    def test_real_file_matches_pinned_known_uncompared_set(self):
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        hits = ea.uncompared_hook_calls(text)
        measured_pairs = {(h.function, h.text) for h in hits}
        self.assertEqual(
            measured_pairs,
            KNOWN_UNCOMPARED,
            msg=(
                f"uncompared_hook_calls() drifted from the pinned set.\n"
                f"missing (were pinned, now absent): {sorted(KNOWN_UNCOMPARED - measured_pairs)}\n"
                f"new (present, not pinned): {sorted(measured_pairs - KNOWN_UNCOMPARED)}"
            ),
        )
        self.assertEqual(
            len(hits),
            KNOWN_UNCOMPARED_TOTAL_OCCURRENCES,
            msg=f"raw occurrence count drifted: {len(hits)} vs pinned {KNOWN_UNCOMPARED_TOTAL_OCCURRENCES}",
        )


class ThresholdAndHarnessCountTests(unittest.TestCase):
    def test_threshold_only_guards_count(self):
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        hits = ea.threshold_only_guards(text)
        self.assertEqual(
            len(hits),
            KNOWN_THRESHOLD_ONLY_COUNT,
            msg=[f"{h.line} {h.function} {h.text}" for h in hits],
        )

    def test_harness_local_flags_count(self):
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        hits = ea.harness_local_flags(text)
        self.assertEqual(
            len(hits),
            KNOWN_HARNESS_LOCAL_FLAG_COUNT,
            msg=[f"{h.line} {h.function} flag={h.flag}" for h in hits],
        )


class WeakCheckpointProbeTests(unittest.TestCase):
    def test_former_weak_checkpoint_probes_do_not_come_back(self):
        """None of the six original weak probe texts is present in e2e.mjs any more.

        Phase B replaced all six, so the old presence-check would now loop over an empty set and
        assert nothing. Inverted, it stays falsifiable: restoring any one of these verbatim lines
        turns this red. The owning function must still exist, so a probe cannot "pass" by having
        its whole case deleted.
        """
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        lines = text.splitlines()
        spans = {span.name: span for span in ea.top_level_functions(lines)}
        self.assertEqual(
            KNOWN_WEAK_CHECKPOINT_PROBES,
            frozenset(),
            msg="KNOWN_WEAK_CHECKPOINT_PROBES is meant to stay empty; strengthen the probe instead",
        )
        for function, needle in sorted(FORMER_WEAK_CHECKPOINT_PROBES):
            self.assertIn(function, spans, msg=f"function {function!r} no longer exists")
            span = spans[function]
            body = "\n".join(lines[span.start : span.end + 1])
            self.assertNotIn(
                needle,
                body,
                msg=f"{function}: a weak probe replaced in round 30 has returned verbatim",
            )

    def test_routes_json_markers_resolve_value_pinning_except_known_weak(self):
        """Every apps/web/test/e2e.mjs checkpoint marker in goldbox_corpus_routes.json
        classifies as value-pinning, except the ones pinned as known-weak above.

        This is the gate a FUTURE checkpoint wired to a harness-local flag (or an uncompared
        hook call, or a threshold-only guard) trips: adding such a checkpoint without adding it
        to KNOWN_WEAK_CHECKPOINT_PROBES / ROUTES_JSON_WEAK_MARKERS makes this test go red.
        """
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        routes = json.loads(ROUTES_PATH.read_text(encoding="utf-8"))
        markers = _routes_json_web_markers(routes)
        self.assertTrue(markers, "no apps/web/test/e2e.mjs checkpoint markers found in routes.json")

        failures = []
        for marker in sorted(markers):
            classification = ea.classify_checkpoint_guard(text, marker)
            if marker in ROUTES_JSON_WEAK_MARKERS:
                continue
            if classification != "value-pinning":
                failures.append((marker, classification))
        self.assertEqual(
            failures,
            [],
            msg=f"checkpoint marker(s) not classified value-pinning: {failures}",
        )

    def test_known_weak_markers_are_exactly_the_ones_excepted(self):
        """ROUTES_JSON_WEAK_MARKERS is exactly the routes.json markers actually named among the
        five KNOWN_WEAK_CHECKPOINT_PROBES -- pins that no OTHER routes.json marker is silently
        being given a pass, and that both excepted markers really do classify weak today (Phase
        B will flip this once the guards are strengthened, which is why this checks weakness
        rather than assuming it)."""
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        for marker in ROUTES_JSON_WEAK_MARKERS:
            self.assertEqual(ea.classify_checkpoint_guard(text, marker), "weak", msg=marker)



# ---------------------------------------------------------------------------
# `page.reload()` inside a module-mounting case (round 30)
#
# `onLibrarySelect` writes `?module=1` into the address bar with `replaceState`. Round 29 pinned
# that as a defect -- a query the app wrote and nothing read -- and round 30 fixed it by making
# `?module=1` a live boot route that restores the last module from IndexedDB. That fix silently
# changed what a bare `page.reload()` MEANS for every harness case that had already opened a
# module: the reload re-enters the module instead of landing on the Library, `.lib-entry` never
# appears, and the next wait dies at its timeout. It cost two cases (`frua-heirs-route`,
# `greyfen-reference-campaign`), and the second one did not fail in the run that found the first,
# because whether the restore fires also depends on what an earlier case left in IndexedDB --
# i.e. the failure is order-dependent and a single green run does not clear it.
#
# The rule: a case that mounts a module must spell "boot from scratch" as an explicit
# `goto(`${BASE}/`)`, never as a reload. The allowlist is an exact set and each entry states why
# its reload is deliberate.
RELOAD_ALLOWED_IN_MODULE_CASES: dict[str, str] = {
    # This case's SUBJECT is the reload: it opens a module, reloads to prove `?module=1` restores
    # it, then deletes the IndexedDB store and reloads again to prove the same URL restores
    # nothing. Replacing these with a bare goto would delete the test.
    "runModuleUrlReload": "the reload is the assertion",
    # Reloads on `?create=1`, before any module is opened, to drop the party cache. No module can
    # be restored because no module has been selected on this page yet.
    "runLibraryBootCompanion": "reload is on ?create=1, before any module is mounted",
}


def _e2e_functions(text: str) -> list[tuple[str, str]]:
    """(name, body) for every top-level `function`/`async function` in e2e.mjs."""
    lines = text.splitlines()
    marks: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        m = re.match(r"^(?:async )?function (\w+)", line)
        if m:
            marks.append((i, m.group(1)))
    out: list[tuple[str, str]] = []
    for idx, (start, name) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(lines)
        out.append((name, "\n".join(lines[start:end])))
    return out


def _strip_comment_lines(body: str) -> str:
    """Drop `//`, `/*` and ` *` lines. The comments that EXPLAIN this rule necessarily contain the
    string `page.reload()`, so counting them would make the guard fire on its own documentation --
    it did, on the first run. Only whole comment lines are dropped; a real call is never one."""
    kept = [ln for ln in body.splitlines() if not ln.lstrip().startswith(("//", "/*", "*"))]
    return "\n".join(kept)


def _module_cases_with_reloads(text: str) -> dict[str, int]:
    found: dict[str, int] = {}
    for name, body in _e2e_functions(text):
        code = _strip_comment_lines(body)
        mounts_module = ".lib-entry" in code or "window.__module" in code
        if not mounts_module:
            continue
        count = len(re.findall(r"\.reload\(", code))
        if count:
            found[name] = count
    return found


class ModuleCaseReloadTests(unittest.TestCase):
    def test_no_unlisted_module_case_uses_reload(self):
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        found = _module_cases_with_reloads(text)
        unlisted = sorted(set(found) - set(RELOAD_ALLOWED_IN_MODULE_CASES))
        self.assertEqual(
            unlisted,
            [],
            msg=(
                "module-mounting e2e case(s) call page.reload(): "
                f"{ {k: found[k] for k in unlisted} }. `?module=1` is a live route, so a bare "
                "reload restores the module instead of booting fresh -- use "
                "`goto(`${BASE}/`)`, or add the case to RELOAD_ALLOWED_IN_MODULE_CASES with a "
                "reason."
            ),
        )

    def test_allowlist_has_no_dead_entries(self):
        """Every allowlisted name must still exist AND still contain a reload -- so the allowlist
        shrinks when a case is fixed instead of quietly granting a pass to nothing."""
        text = ea.E2E_PATH.read_text(encoding="utf-8")
        found = _module_cases_with_reloads(text)
        dead = sorted(set(RELOAD_ALLOWED_IN_MODULE_CASES) - set(found))
        self.assertEqual(dead, [], msg=f"allowlist entries no longer reload: {dead}")

    def test_detector_finds_a_planted_reload(self):
        """The null: the detector must be able to fail. Plant a module-mounting function with a
        reload and require exactly that one hit -- a detector that never fires is not a guard."""
        planted = textwrap.dedent(
            """\
            async function runPlantedModuleCase(browser) {
              await page.click('.lib-entry');
              await page.reload({ waitUntil: 'networkidle2' });
            }
            async function runPlantedNonModuleCase(browser) {
              await page.reload({ waitUntil: 'networkidle2' });
            }
            async function runPlantedCommentOnlyCase(browser) {
              await page.click('.lib-entry');
              // Deliberately NOT a page.reload({ ... }) -- this line must not be counted.
              await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
            }
            """
        )
        found = _module_cases_with_reloads(planted)
        self.assertEqual(found, {"runPlantedModuleCase": 1})


if __name__ == "__main__":
    unittest.main()
