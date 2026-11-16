"""Which engine exports can any application actually reach?

A passing unit test proves a decoder is correct. It says nothing about whether anything
*calls* it. Four separate pieces of finished, verified work in this repo turned out on
2026-08-22..24 to be connected to nothing that would notice if they broke -- Amiga `*COM`
combat backdrops, GLIB in `decodeAsset`, HLIB method-25 composites, and the whole DQK
`.QSV` save family. This is the cheap sweep that finds them, made repeatable.

Every name re-exported from `packages/engine/src/index.ts` is placed in exactly one bucket:

  app              reachable from `apps/` product code (the web viewer, the Electron shell)
  harness          reachable only from `apps/**/test/**` -- an e2e harness, not a feature
  other            reachable from `tools/`, `scripts/`, or a sibling package
  engine-internal  used by another engine module; a building block, which is fine
  test-only        used by nothing but `packages/engine/test/**`
  unreferenced     used by nothing at all, anywhere

`test-only` and `unreferenced` are the interesting ones. Neither is automatically a defect --
an encoder for the DOS rebuild track legitimately has no web consumer -- so this reports
rather than judges, and `tools/test_goldbox_corpus.py` pins the counts so a *new* entry has
to be looked at deliberately.

Four mistakes this has made so far. The first two inflated `app` and `engine-internal` and so hid
real holes; the second two, found 2026-08-25, pushed 46 names the other way -- 7 of them into
`unreferenced`, the bucket the whole tool exists to produce:

  * **JSDoc counted as usage.** `dqkSave.ts` mentions `{@link readQsvRoster}` in its own
    comments, which made a function with zero callers look internally used. Comments are
    stripped before matching.
  * **A module counted as its own consumer.** The file that defines a name always contains
    it. The defining module is excluded from the internal search.
  * **Three of the four `other` globs matched zero files.** `tools/` keeps its TypeScript as
    `.mts`, so `tools/**/*.mjs`, `tools/**/*.js` and `scripts/**/*.mjs` were a filter that
    always said no, and every tool-only consumer fell through to a later bucket.
  * **Excluding the barrel excluded seven ordinary modules.** `not s.endswith("/index.ts")` was
    meant to drop the top-level re-export barrel; it also dropped `model/index.ts`,
    `ruleset/index.ts` and five more, which define and import things like any other file. The
    test compares against the resolved barrel path instead.

`tools/test_sweep_engine_reach.py` now pins a sample of names against the bucket their imports
imply, precisely so a glob list nobody reads cannot quietly degrade into a filter that says no.

Run: `python tools/sweep_engine_reach.py [--json]`
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_SRC = REPO_ROOT / "packages" / "engine" / "src"
INDEX = ENGINE_SRC / "index.ts"
_BARREL_SPEC = "./index.js"

_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_LINE_COMMENT = re.compile(r"(?<![:/])//[^\n]*")
_STRING = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)


def strip_comments(source: str) -> str:
    """Remove comments only, keeping string literals -- which is what import specifiers are."""
    source = _BLOCK_COMMENT.sub(" ", source)
    return _LINE_COMMENT.sub(" ", source)


def strip_noise(source: str) -> str:
    """Remove comments and string literals so only real code identifiers remain.

    Load-bearing: without it every `{@link foo}` and every `'foo'` in an error message reads
    as a call site, which is how a function with no callers passed for used.

    Not usable for import scanning: it deletes `'@goldbox/engine'` along with every other
    string, which silently reduced the module-reachability seed set to zero -- a probe that
    could not succeed, reported as "the product pulls in nothing".
    """
    return _STRING.sub(" ", strip_comments(source))


def exported_names() -> set[tuple[str, str, bool]]:
    """`(name, specifier, is_type)` for every name re-exported from the engine barrel.

    `is_type` is tracked because it changes what "unreachable" means. A TypeScript interface
    is normally referenced only inside the module that defines its function signatures, so
    "no consumer outside its own file" is the expected state for a type and a smell only for
    a runtime value. Conflating the two buries nine real findings under four hundred types.
    """
    text = INDEX.read_text(encoding="utf-8")
    out: set[tuple[str, str, bool]] = set()
    for kind, block, spec in re.findall(
        r"export\s*(type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'", text, re.S
    ):
        block_is_type = bool(kind)
        for part in block.split(","):
            part = part.strip()
            part_is_type = block_is_type or bool(re.match(r"^type\s+", part))
            part = re.sub(r"^type\s+", "", part)
            if " as " in part:
                part = part.split(" as ")[-1].strip()
            if re.fullmatch(r"[A-Za-z_$][\w$]*", part):
                out.add((part, spec, part_is_type))
    return out


def _module_path(spec: str) -> Path:
    """`./loaders/dqkSave.js` -> the real `.ts` file it points at."""
    return (ENGINE_SRC / spec.removeprefix("./")).with_suffix(".ts")


def _read(globs, keep, clean=strip_noise) -> list[tuple[Path, str]]:
    files: list[tuple[Path, str]] = []
    for pattern in globs:
        for path in REPO_ROOT.glob(pattern):
            posix = path.as_posix()
            if "/dist" in posix or "node_modules" in posix:
                continue
            if not keep(posix):
                continue
            try:
                files.append((path, clean(path.read_text(encoding="utf-8", errors="ignore"))))
            except OSError:
                continue
    return files


def classify(only: set[str] | None = None) -> dict[str, list[dict]]:
    """Bucket every exported name. Pass `only` to bucket just those names.

    The full sweep is ~90s -- one regex pass per exported name over the whole tree -- which is
    fine for a report run by hand and much too slow for a standing gate. `only` lets
    `test_sweep_engine_reach.py` pin the handful of names that caught real misbucketing without
    paying for the other ~1500.
    """
    app = _read(["apps/**/*.ts", "apps/**/*.mjs", "apps/**/*.js"], lambda s: "/test/" not in s)
    harness = _read(["apps/**/test/**/*.mjs", "apps/**/test/**/*.ts", "apps/**/test/**/*.js"], lambda s: True)
    # `tools/` holds its TypeScript as `.mts`, not `.ts`/`.js`/`.mjs` -- three of the four globs
    # here matched literally zero files until 2026-08-25, so every tool-only consumer fell through
    # to a later bucket. `.ts`/`.js` variants are kept anyway: they cost nothing and stop the same
    # thing happening the day someone adds one.
    other = _read(
        [
            "tools/**/*.mts", "tools/**/*.ts", "tools/**/*.mjs", "tools/**/*.js",
            "scripts/**/*.mts", "scripts/**/*.ts", "scripts/**/*.mjs", "scripts/**/*.js",
            "packages/*/src/**/*.ts",
        ],
        lambda s: "packages/engine/" not in s,
    )
    # Only the TOP-LEVEL barrel has to be excluded -- it re-exports every name, so leaving it in
    # would mark the whole surface internally used. A suffix test on "/index.ts" also threw out the
    # seven NESTED barrels, which are ordinary modules with their own definitions and imports
    # (`model/index.ts` alone is 367 lines of type declarations, and `ruleset/index.ts` is what
    # imports all four ruleset plugins). Compare the resolved path instead.
    internal = _read(["packages/engine/src/**/*.ts"], lambda s: s != INDEX.as_posix())
    tests = _read(["packages/engine/test/**/*.ts"], lambda s: True)

    def hit(name: str, files, skip: Path | None = None) -> bool:
        pattern = re.compile(r"\b" + re.escape(name) + r"\b")
        return any(pattern.search(text) for path, text in files if path != skip)

    results: dict[str, list[dict]] = defaultdict(list)
    for name, spec, is_type in sorted(exported_names()):
        if only is not None and name not in only:
            continue
        owner = _module_path(spec)
        if hit(name, app):
            bucket = "app"
        elif hit(name, other):
            bucket = "other"
        elif hit(name, internal, skip=owner):
            bucket = "engine-internal"
        elif hit(name, harness):
            bucket = "harness"
        elif hit(name, tests):
            bucket = "test-only"
        else:
            bucket = "unreferenced"
        results[bucket].append({"name": name, "module": spec, "type": is_type})
    return results



def module_reachability() -> dict:
    """Which engine modules does the product actually pull in, transitively?

    Name-level buckets answer "is this export called". This answers the blunter and more
    actionable question: starting from the names `apps/` imports from `@goldbox/engine`,
    and following engine-internal imports, which modules are never reached at all? Those
    are whole capabilities with no path from the product to them.

    The barrel is deliberately not a seed. `index.ts` re-exports every module, so treating
    an import of the package as an import of everything would mark the entire engine
    reachable and answer nothing.
    """
    name_to_module = {}
    for name, spec, _ in exported_names():
        name_to_module.setdefault(name, spec)

    app = _read(["apps/**/*.ts", "apps/**/*.mjs", "apps/**/*.js"], lambda s: "/test/" not in s,
                clean=strip_comments)
    seeds: set[str] = set()
    for _, text in app:
        for block in re.findall(r"import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@goldbox/engine[^']*'", text, re.S):
            for part in block.split(","):
                part = re.sub(r"^\s*type\s+", "", part.strip())
                if " as " in part:
                    part = part.split(" as ")[0].strip()
                spec = name_to_module.get(part)
                if spec:
                    seeds.add(spec)
                elif part:
                    # A name the barrel does not re-export is DEFINED in index.ts -- e.g.
                    # `decodeAsset`, whose own imports are the only path to `./loaders/ilbm.js`.
                    # Without this the barrel's dependencies read as unreachable and the tool
                    # reports a live format as dead.
                    seeds.add(_BARREL_SPEC)

    # engine-internal import graph, keyed by the same './x.js' specifier shape as the barrel.
    # index.ts is a node like any other: it re-exports everything, so it is never a seed on
    # its own, but code defined inside it does have real dependencies.
    edges: dict[str, set[str]] = {}
    for path in ENGINE_SRC.rglob("*.ts"):
        spec = "./" + path.relative_to(ENGINE_SRC).with_suffix(".js").as_posix()
        text = strip_comments(path.read_text(encoding="utf-8", errors="ignore"))
        # `import` and `export ... from` are both dependencies -- except in the barrel, where
        # the re-export lines ARE the barrel and following them marks all 177 modules live.
        # Only code genuinely defined in index.ts (`decodeAsset` and friends) contributes.
        targets = re.findall(r"\bimport\b[^;]*?from\s*'(\.[^']+)'", text, re.S)
        if spec != _BARREL_SPEC:
            targets += re.findall(r"\bexport\b[^;]*?from\s*'(\.[^']+)'", text, re.S)
        out: set[str] = set()
        for target in targets:
            resolved = (path.parent / target).resolve()
            try:
                rel = resolved.relative_to(ENGINE_SRC)
            except ValueError:
                continue
            out.add("./" + rel.as_posix())
        edges[spec] = out

    reached = set()
    stack = [s for s in seeds if s in edges]
    while stack:
        cur = stack.pop()
        if cur in reached:
            continue
        reached.add(cur)
        stack.extend(edges.get(cur, ()))

    unreached = sorted(set(edges) - reached - {_BARREL_SPEC})
    return {
        "total": len(edges) - 1,
        "seeds": len(seeds - {_BARREL_SPEC}),
        "reached": len(reached - {_BARREL_SPEC}),
        "unreached": unreached,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable output")
    args = parser.parse_args(argv)

    results = classify()
    modules = module_reachability()
    if args.json:
        payload = {"names": {k: v for k, v in sorted(results.items())}, "modules": modules}
        json.dump(payload, sys.stdout, indent=2)
        print()
        return 0

    counts = Counter({k: len(v) for k, v in results.items()})
    values = Counter({k: sum(1 for r in v if not r["type"]) for k, v in results.items()})
    total = sum(counts.values())
    print("engine barrel: %d exported names (%d runtime values, %d types)"
          % (total, sum(values.values()), total - sum(values.values())))
    print("  %-16s %6s %8s" % ("", "all", "values"))
    for bucket in ("app", "engine-internal", "other", "harness", "test-only", "unreferenced"):
        print("  %-16s %6d %8d" % (bucket, counts[bucket], values[bucket]))

    print()
    print("module reachability: %d engine modules, %d seeded by an app import, %d reached transitively"
          % (modules["total"], modules["seeds"], modules["reached"]))
    print("%d engine modules the product never pulls in:" % len(modules["unreached"]))
    for spec in modules["unreached"]:
        print("   %s" % spec)

    for bucket in ("test-only", "unreferenced", "harness"):
        rows = [r for r in results.get(bucket, []) if not r["type"]]
        if not rows:
            continue
        print()
        print("%s -- runtime values only (%d):" % (bucket, len(rows)))
        by_module: dict[str, list[str]] = defaultdict(list)
        for row in rows:
            by_module[row["module"]].append(row["name"])
        for module, names in sorted(by_module.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            print("  %-40s %s" % (module, ", ".join(sorted(names))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
