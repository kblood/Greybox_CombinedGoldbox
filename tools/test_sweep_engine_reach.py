"""Guards for the reachability sweep's *name-level* half (`classify()`).

`module_reachability()` is pinned by `test_goldbox_corpus.py`. `classify()` was not pinned by
anything, and on 2026-08-25 it turned out to be wrong in two ways that both pushed names into the
wrong bucket -- including out of `unreferenced`, which is the bucket the whole tool exists to
produce:

  * three of the four `other` globs (`tools/**/*.mjs`, `tools/**/*.js`, `scripts/**/*.mjs`)
    matched literally zero files, because `tools/` keeps its TypeScript as `.mts`;
  * `not s.endswith("/index.ts")` excluded the seven NESTED barrels along with the top-level
    one, so `ruleset/index.ts` -- the module that imports all four ruleset plugins -- counted as
    no one's consumer.

Fixing both moved 46 names, 7 of them out of `unreferenced`. These tests are the cheap check that
would have caught either: a glob list nobody looks at silently degrades into a filter that says no.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import sweep_engine_reach as sweep  # noqa: E402


class SweepGlobsMatchRealFiles(unittest.TestCase):
    def test_every_bucket_reads_at_least_one_file(self):
        """A bucket built from globs that match nothing cannot report anything."""
        buckets = {
            "app": (["apps/**/*.ts", "apps/**/*.mjs", "apps/**/*.js"], lambda s: "/test/" not in s),
            "harness": (
                ["apps/**/test/**/*.mjs", "apps/**/test/**/*.ts", "apps/**/test/**/*.js"],
                lambda s: True,
            ),
            "internal": (
                ["packages/engine/src/**/*.ts"],
                lambda s: s != sweep.INDEX.as_posix(),
            ),
            "tests": (["packages/engine/test/**/*.ts"], lambda s: True),
        }
        for label, (globs, keep) in buckets.items():
            with self.subTest(bucket=label):
                self.assertGreater(len(sweep._read(globs, keep)), 0, label)

    def test_the_tools_bucket_sees_the_mts_files(self):
        """`other` is the bucket the dead globs emptied. Name the extension explicitly."""
        files = sweep._read(["tools/**/*.mts"], lambda s: True)
        self.assertGreater(len(files), 0, "tools/*.mts is where the tool-side TypeScript lives")

    def test_nested_barrels_are_read_but_the_top_level_one_is_not(self):
        read = {p.as_posix() for p, _ in sweep._read(
            ["packages/engine/src/**/*.ts"], lambda s: s != sweep.INDEX.as_posix()
        )}
        self.assertNotIn(sweep.INDEX.as_posix(), read, "the barrel re-exports everything")
        nested = [p for p in read if p.endswith("/index.ts")]
        # The null for the assertion above: excluding the barrel must not exclude these too.
        self.assertGreater(len(nested), 1, "nested barrels are ordinary modules")


class SweepClassificationIsNotDegenerate(unittest.TestCase):
    # A full `classify()` is ~90s -- one regex pass per exported name over the whole tree -- which
    # is too slow to sit in a standing gate, so these pin a named sample via `classify(only=...)`.
    # Every name below is one the two bugs actually misplaced.
    SAMPLE = {
        # tool-only consumers: reported `test-only`/`unreferenced` while the `other` globs matched
        # no files at all.
        "planDqkBuild": "other",
        "buildDqkGameData": "other",
        "parseDqkCodes": "other",
        "answerDqkProtection": "other",
        # `ruleset/index.ts` imports all four plugins; excluding nested barrels hid three of them.
        "addnd1eDragonlance": "engine-internal",
        "addnd2e": "engine-internal",
        "buckrogers": "engine-internal",
        # ... and the fourth was already correct by another route, which is the null for the row
        # above: the fix must not simply move everything into `engine-internal`.
        "addnd1e": "app",
    }

    @classmethod
    def setUpClass(cls):
        cls.where = {
            n["name"]: b
            for b, v in sweep.classify(only=set(cls.SAMPLE)).items()
            for n in v
        }

    def test_the_sample_lands_where_the_imports_say_it_should(self):
        self.assertEqual(len(self.where), len(self.SAMPLE), "a sampled name stopped being exported")
        for name, bucket in self.SAMPLE.items():
            with self.subTest(name=name):
                self.assertEqual(self.where.get(name), bucket, name)

    def test_the_sample_is_not_all_one_bucket(self):
        """The null. Three buckets among eight names, so a filter that says yes to everything --
        or no to everything -- cannot pass the test above."""
        self.assertGreaterEqual(len(set(self.where.values())), 3)


if __name__ == "__main__":
    unittest.main()
