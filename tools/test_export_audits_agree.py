"""Do the two independent export audits agree, and where they don't, WHY?

This repo runs two unrelated reachability audits over the same barrel
(`packages/engine/src/index.ts`):

  * `tools/engine_export_consumers.py` -- token-index: an export is CONSUMED if some file
    outside the engine's own `src`+`test` names it. Full run ~0.7 s.
  * `tools/sweep_engine_reach.py` -- bucketing: `app` / `other` / `engine-internal` /
    `harness` / `test-only` / `unreferenced`. Full run ~92.6 s.

Nothing compared them, so each could drift alone. Round 35 R6 compared them and the
comparison found two real defects in `sweep_engine_reach.py` -- neither of which is fixed
here, because that file is not this round's to edit. They are PINNED instead, so that
whoever fixes them has to come through this file and update it deliberately.

DEFECT 1 -- `exported_names()` reads `index.ts` RAW and splits export blocks on commas.
`strip_comments` exists in that same module and is not applied here. Consequence, both
directions, measured:

  * PHANTOMS. `index.ts:1122` reads
      `// offset 0xEB91 (Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster).`
    inside an `export { ... } from './loaders/secretSavedCharacter.js'` block. Splitting on
    its commas yields five parts that pass `[A-Za-z_$][\\w$]*` -- Elf, Dwarf, Gnome, Halfling,
    Human -- and the sweep reports all five as engine exports. They are not. It then buckets
    all five `unreferenced`, i.e. it invents five findings.
  * DROPS. A name on the line AFTER a comment inside such a block is glued to that comment
    in the same comma-part and fails the fullmatch, so it vanishes from the surface:
    `TIME_SCALES` (:270, after `// 7-slot mixed-radix calendar (ovr021)`),
    `AFFECT_CHUNK_MINUTES` (:287), `REST_TICKS_PER_HEAL` (:290), `SECRET_RACE_LABEL` (:1123).
    Two of those four are names `engine_export_consumers` reports UNCONSUMED, so the sweep
    is silently blind to real findings, not just noisy.

  The arithmetic closes exactly: 1655 (eec) - 4 dropped - 2 inline (`decodeAsset`,
  `DecodedAsset`, declared in `index.ts` itself rather than re-exported, which the sweep's
  `export {..} from '..'` regex cannot see and which is a LEGITIMATE difference) + 5 phantom
  = 1654 (sweep). Pinned in `test_barrel_surfaces_reconcile_exactly`.

DEFECT 2 -- `classify()`'s app globs exclude only paths containing `/dist` or `node_modules`.
The git-ignored Electron build output lives at
`apps/electron/release/win-unpacked/resources/web-dist-app/assets/index-*.js`; the substring
there is `/web-dist-app`, not `/dist`, so a minified production bundle is read as app source.
Measured: `allowanceTenths` has NO reference anywhere under `apps/` except that bundle and
`apps/web/dist-app/` (correctly excluded), yet the sweep buckets it `app`. On a clone that
has not run `pnpm build:electron` it buckets `test-only`, agreeing with
`engine_export_consumers`. So this audit's answer depends on untracked build state. Pinned
in `test_allowance_tenths_bucket_depends_on_a_gitignored_bundle`.

COST. The bucket half of this module runs `classify(only=...)` over a bounded control set --
measured 2.0 s, against 92.6 s for the full sweep. `pnpm test:corpus` runs the whole `tools/`
suite, so the full 754-name agreement is reported once by hand in
`docs/engine/research/prose-wiring-claims.md` and is NOT re-derived here.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import engine_export_consumers as eec  # noqa: E402
import sweep_engine_reach as ser  # noqa: E402
from test_engine_export_consumers import KNOWN_UNCONSUMED  # noqa: E402

# --- barrel-surface reconciliation, measured 2026-10-01 on the current working tree --------
EEC_SURFACE = 1685
SWEEP_SURFACE = 1684

# Declared inside index.ts rather than re-exported from a module. A real difference in what
# the two tools are asking, not a bug.
INLINE_DECLARED = frozenset({"decodeAsset", "DecodedAsset"})
# Swallowed by the comment on the line above them (defect 1, drop direction).
COMMENT_SWALLOWED = frozenset(
    {"TIME_SCALES", "AFFECT_CHUNK_MINUTES", "REST_TICKS_PER_HEAL", "SECRET_RACE_LABEL"}
)
# Invented out of comment prose (defect 1, phantom direction).
COMMENT_PHANTOMS = frozenset({"Elf", "Dwarf", "Gnome", "Halfling", "Human"})

# --- bounded bucket controls ---------------------------------------------------------------
# Every name here was chosen because it discriminates, not because it is convenient:
#  * the nine `decodeAsset`-body names are the whole reason the two audits disagree in bulk
#    (eec counts index.ts's own body as a consumer; the sweep deliberately excludes the
#    barrel), so they pin the disagreement as INTENDED rather than accidental;
#  * the three round-35 PIN decisions (renderWallView / TILE / C64) are the names the
#    string-literal tokenizer fix moved into KNOWN_UNCONSUMED;
#  * DOS_EGA and SCREEN_WIDTH are the built-in control -- genuinely app-consumed, and they
#    must NOT move when a tokenizer changes;
#  * the phantoms are defect 1 made visible.
EXPECTED_BUCKETS: dict[str, str] = {
    # consumed only by index.ts's own decodeAsset body -> eec CONSUMED, sweep test-only/unref
    "DaxArchive": "unreferenced",
    "IlbmImage": "unreferenced",
    "PoolAmigaArchive": "unreferenced",
    "decodeIlbm": "test-only",
    "decodePoolAmiga": "test-only",
    "sniffDaa": "test-only",
    "sniffDax": "test-only",
    "sniffIlbm": "test-only",
    "sniffPoolAmiga": "test-only",
    # round 35 R6's three PIN decisions
    "renderWallView": "test-only",
    "renderWallViewIndexed": "test-only",
    "TILE": "unreferenced",
    "C64": "test-only",
    # C64's only referent, itself unconsumed, and its sibling
    "DISPLAY_PROFILES": "test-only",
    "AMIGA_PAL": "test-only",
    # controls that must not move
    "DOS_EGA": "app",
    "SCREEN_WIDTH": "app",
    "decodeDax": "app",
    "decodeGlib": "app",
    "loadGame": "app",
    "firstGlibPalette": "app",
    # defect 1's phantoms
    "Elf": "unreferenced",
    "Dwarf": "unreferenced",
    "Gnome": "unreferenced",
    "Halfling": "unreferenced",
    "Human": "unreferenced",
}

SWEEP_UNCONSUMED_BUCKETS = frozenset({"test-only", "unreferenced"})

ELECTRON_BUNDLE_DIR = REPO_ROOT / "apps" / "electron" / "release"


def _eec_surface() -> set[str]:
    return {e.name for e in eec.exports()}


def _sweep_surface() -> set[str]:
    return {name for name, _spec, _is_type in ser.exported_names()}


class BarrelSurface(unittest.TestCase):
    def test_barrel_surfaces_reconcile_exactly(self) -> None:
        """Both counts, both diff directions, and the arithmetic that joins them.

        Pinning only the two totals would let a phantom and a drop cancel out."""
        e, s = _eec_surface(), _sweep_surface()
        self.assertEqual(EEC_SURFACE, len(e), "engine_export_consumers' barrel surface moved")
        self.assertEqual(SWEEP_SURFACE, len(s), "sweep_engine_reach's barrel surface moved")
        self.assertEqual(
            INLINE_DECLARED | COMMENT_SWALLOWED, e - s,
            "the names only engine_export_consumers sees changed. Two of these "
            "(decodeAsset/DecodedAsset) are a legitimate difference; the other four are "
            "sweep_engine_reach.exported_names() failing to strip comments. See this "
            "module's docstring before re-pinning.",
        )
        self.assertEqual(
            COMMENT_PHANTOMS, s - e,
            "the names only sweep_engine_reach sees changed. These are not exports at all -- "
            "they are words from the comment at packages/engine/src/index.ts:1122.",
        )
        self.assertEqual(
            SWEEP_SURFACE,
            EEC_SURFACE - len(COMMENT_SWALLOWED) - len(INLINE_DECLARED) + len(COMMENT_PHANTOMS),
            "the reconciliation arithmetic no longer closes",
        )

    def test_phantom_names_are_not_real_exports(self) -> None:
        """The phantoms must be shown to be prose, not merely absent from one audit.

        Otherwise this file would be pinning a disagreement without saying who is right."""
        index = (REPO_ROOT / "packages" / "engine" / "src" / "index.ts").read_text(encoding="utf-8")
        stripped = ser.strip_comments(index)
        for name in sorted(COMMENT_PHANTOMS):
            self.assertNotIn(
                name, _eec_surface(),
                f"{name} is now a real engine export; the phantom pin is stale",
            )
            self.assertIn(name, index, f"{name} no longer appears in index.ts at all")
            self.assertNotIn(
                name, stripped,
                f"{name} survives comment-stripping, so it is no longer comment prose and "
                f"this pin's premise is wrong",
            )

    def test_swallowed_names_are_real_exports_the_sweep_cannot_see(self) -> None:
        """The drop direction, shown to be a loss and not a correct exclusion.

        Two of the four are names engine_export_consumers reports UNCONSUMED, which is the
        part that matters: the sweep is blind to findings, not just to names."""
        s = _sweep_surface()
        for name in sorted(COMMENT_SWALLOWED):
            self.assertNotIn(name, s, f"{name} is now visible to the sweep; defect 1 may be fixed")
        blind_spots = COMMENT_SWALLOWED & KNOWN_UNCONSUMED
        self.assertEqual(
            {"AFFECT_CHUNK_MINUTES", "SECRET_RACE_LABEL"}, blind_spots,
            "the set of unconsumed exports sweep_engine_reach cannot see changed",
        )


class BucketAgreement(unittest.TestCase):
    """Bounded `classify(only=...)`. Measured 2.0 s; the full sweep is 92.6 s."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.buckets = ser.classify(only=set(EXPECTED_BUCKETS))
        cls.where = {
            row["name"]: bucket
            for bucket, rows in cls.buckets.items()
            for row in rows
        }

    def test_bounded_buckets_match(self) -> None:
        got = {n: self.where.get(n, "<absent from sweep surface>") for n in EXPECTED_BUCKETS}
        self.assertEqual(
            EXPECTED_BUCKETS, got,
            "a control export changed bucket. If a tokenizer or glob changed, say which "
            "names moved and why in the same commit -- DOS_EGA and SCREEN_WIDTH moving means "
            "the change broke real-consumption detection.",
        )

    def test_the_two_audits_agree_on_the_controls_or_disagree_for_a_named_reason(self) -> None:
        """Cross-audit agreement over the bounded set, with the intended exception spelled out.

        `engine_export_consumers` counts `index.ts`'s own `decodeAsset` body as a consumer;
        `sweep_engine_reach` deliberately excludes the top-level barrel. So nine names are
        CONSUMED by one audit and unreferenced/test-only by the other, ON PURPOSE. Any name
        outside that list disagreeing is a real drift."""
        expected_exception = frozenset({
            "DaxArchive", "IlbmImage", "PoolAmigaArchive", "decodeIlbm", "decodePoolAmiga",
            "sniffDaa", "sniffDax", "sniffIlbm", "sniffPoolAmiga",
        })
        disagree = set()
        for name in EXPECTED_BUCKETS:
            if name in COMMENT_PHANTOMS:
                continue  # not an export; neither audit's answer is meaningful
            eec_unconsumed = name in KNOWN_UNCONSUMED
            sweep_unconsumed = self.where.get(name) in SWEEP_UNCONSUMED_BUCKETS
            if eec_unconsumed != sweep_unconsumed:
                disagree.add(name)
        self.assertEqual(
            expected_exception, disagree,
            "the two audits' disagreement set changed. The nine expected members are all "
            "consumed only by index.ts's own decodeAsset body. A name joining or leaving "
            "this set means one of the two audits changed what it measures.",
        )

    def test_allowance_tenths_bucket_depends_on_a_gitignored_bundle(self) -> None:
        """DEFECT 2, pinned in whichever direction this clone is in.

        `allowanceTenths` is referenced under `apps/` ONLY by minified build output. With the
        Electron bundle present the sweep calls it `app`; without it, `test-only` -- which is
        what `engine_export_consumers` says. Two audits, one truth, and the tiebreak is
        whether someone happened to run a packaging build."""
        bucket = {
            row["name"]: b for b, rows in ser.classify(only={"allowanceTenths"}).items()
            for row in rows
        }.get("allowanceTenths")
        self.assertIn("allowanceTenths", KNOWN_UNCONSUMED,
                      "engine_export_consumers no longer calls allowanceTenths unconsumed; "
                      "re-derive this pin rather than editing the expected bucket")
        if ELECTRON_BUNDLE_DIR.exists():
            self.assertEqual(
                "app", bucket,
                "apps/electron/release/ is present but allowanceTenths is no longer bucketed "
                "`app`. Either sweep_engine_reach's app glob was fixed (good -- delete this "
                "branch and pin `test-only` unconditionally) or the bundle no longer contains "
                "the minified property name.",
            )
        else:
            self.assertEqual(
                "test-only", bucket,
                "no Electron bundle in this clone, yet allowanceTenths is not `test-only`. "
                "Something other than the bundle is now referencing it under apps/.",
            )


if __name__ == "__main__":
    unittest.main()
