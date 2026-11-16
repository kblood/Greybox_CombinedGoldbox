"""Every `DecodedAsset` format must be handled at every dispatch site -- and the site LIST must
be enumerated from the source, not typed in.

WHY THIS EXISTS (2026-09-03, round 32 Phase B). `pool-amiga` landed as the codebase's fourth
Amiga container and sixth `DecodedAsset` format. Its decoder was correct -- 843/843 block
hashes and 1672/1672 frame hashes against the Python oracle -- and `decodeAsset` routed to it
correctly. But only ONE of the three places that flatten a `DecodedAsset` into a frame list
learned about it:

  * `apps/web/src/ui/nwnPreview.ts`        got a branch  -> showed all 1672 frames
  * `packages/engine/src/game/loadGame.ts` did not       -> showed 744 (928 hidden)
  * `apps/web/src/ui/main.ts`              did not       -> under-counted AND labelled the
                                                            files `format: 'DAX'`, which
                                                            they are not

Nothing was red. Every decoder test passed. Grepping for the new format string found
nwnPreview's branch and read as success. So the check that works is a COUNT across sites, not
an existence test anywhere.

WHY IT WAS REWRITTEN (2026-09-05, round 35 R3). The first version fixed the per-format count and
then reintroduced the same class of bug one level up: the SITE LIST was a hand-maintained
three-entry constant, so the audit could only ever be as complete as the person who last edited
it. It was not complete. `grep 'decoded.format'` finds FIVE product files, not three:
`apps/web/src/ui/intro.ts` (`titleScreens`: branches dax/hlib, `return []` otherwise) and
`apps/web/src/ui/combat.ts` (`combatBackdropFrom`: branches dax/daa, `return null` otherwise;
plus `spriteFrom` and `iconLibraryFrom`, which dispatch through `!==` and are DAX-only) were
invisible to it. A test that declares its own scope cannot notice a site outside that scope --
which is precisely what it exists to catch. The site list is now ENUMERATED from the source and
compared against the declaration, so adding a dispatch anywhere fails here.

The `!==` form matters and is deliberately included in the enumeration: `combat.ts`'s
`spriteFrom` reads `if (decoded.format !== 'dax') return null;`, which is a dispatch by any
useful definition and which a `===`-only grep -- including the one in round 35's own plan --
misses entirely.

THE RULE THIS FILE ENFORCES, and why it is not vacuous:

A FLATTENING site ends in a catch-all, and the catch-all is NOT generic -- its body is written
for one specific format and would mis-handle any other:

  * `loadGame.ts` and `main.ts` fall through to a body that reads DAX blocks and applies a
    DAX-kind multi-frame allowlist. That allowlist is why `pool-amiga` lost 928 frames: its
    multi-frame blocks carry `kind: 'standard'`, which `decodeDax` never emits.
  * `nwnPreview.ts` ends in `else { ... decoded.image.image }`, which is the ILBM arm -- TS
    narrowing makes it exhaustive, but the BODY only makes sense for the single-image format.

So a catch-all credits exactly ONE format, declared in `SITE_CATCHALL` below and verified
against the source. Every other union member needs an explicit branch. A generic catch-all
would make this test vacuous; the declaration is checked so one cannot be introduced silently.

A SELECTOR site (intro.ts, combat.ts) has no catch-all: it returns empty/null for anything it
does not branch on. Those are not defects to be papered over -- `combat.ts` needs 24x24
cell-sized tiles and there is no honest way to synthesise one from an HLIB bank that has none --
so each carries an entry in `DOCUMENTED_EXCLUSIONS` naming exactly which formats it drops and
why, and the entry must match the source exactly (no more, no fewer). That turns a silent hole
into a stated one, and makes it fail loudly if the site later grows or loses a branch.

MEASURED, so the exclusions are not a shrug (round 35 R3, `docs/engine/research/
hlib-glib-composites.md`): across every live route, `intro.ts` is fed 10 distinct title-path
literals -- 9 `.DAX` and 1 `.TLB` (DQK) -- and `combat.ts` 115 backdrop/tile/icon path literals,
all `.DAX` or `.DAA`. So both exclusions hide ZERO frames today. They are latent gaps, not
losses.

Further guards against a vacuous pass:

  1. An empty union parse would satisfy every per-site assertion. `test_union_is_parsed...`
     pins exact membership. (This guard already earned its place: the first draft used a
     non-greedy `(.*?);` block match, which terminates on the `;` INSIDE the first member and
     yielded a one-element union. The guard caught it.)
  2. An empty enumerated site list would check nothing. The enumeration is asserted non-empty
     and each site is asserted to parse at least two format comparisons.
  3. A site credited with a catch-all it lacks would hide a missing branch. Each declaration
     is verified against the file's actual text.
  4. The comment/string stripper is itself pinned by a unit test, because a stripper that ate
     everything would make the enumeration empty and every downstream check free.

Adding a seventh format is expected to fail this in several places at once. That is intended:
the failure list IS the wiring checklist.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

UNION_FILE = Path("packages/engine/src/index.ts")

LOADGAME = Path("packages/engine/src/game/loadGame.ts")
MAIN = Path("apps/web/src/ui/main.ts")
NWNPREVIEW = Path("apps/web/src/ui/nwnPreview.ts")
INTRO = Path("apps/web/src/ui/intro.ts")
COMBAT = Path("apps/web/src/ui/combat.ts")

# Directories enumerated for dispatch sites. Product source only: a test file that branches on
# `decoded.format` is exercising a decoder, not routing the app's frames.
SCAN_ROOTS = (Path("apps/web/src"), Path("packages/engine/src"))

# The FLATTENING sites: each turns a `DecodedAsset` into a list of renderable frames and ends in
# a terminal catch-all, mapped here to the ONE format that catch-all is written for.
SITE_CATCHALL: dict[Path, str] = {
    LOADGAME: "dax",
    MAIN: "dax",
    NWNPREVIEW: "ilbm",
}

# The SELECTOR sites: no catch-all, an empty/null return for anything unbranched. Each entry is
# (formats deliberately not handled, why). Asserted to equal the source's actual gap exactly.
DOCUMENTED_EXCLUSIONS: dict[Path, tuple[frozenset[str], str]] = {
    INTRO: (
        frozenset({"glib", "daa", "ilbm", "pool-amiga"}),
        "`titleScreens` composes a boot title screen and only the DOS families ship one it can "
        "compose: DAX multi-block titles and HLIB image sets. Every live route feeds it one of "
        "those (10 title-path literals: 9 .DAX + DQK's TITLE.TLB), so the gap hides 0 frames "
        "today. An Amiga title route would need its own composition rule, not a fallthrough.",
    ),
    COMBAT: (
        frozenset({"hlib", "glib", "ilbm", "pool-amiga"}),
        "`combatBackdropFrom` filters for 24x24 cell-sized tiles, and `spriteFrom` / "
        "`iconLibraryFrom` (which dispatch via `!==`) read DAX block shapes directly. DQK's "
        "HLIB `DUNGCOM.TLB` has no 24x24 members, so a branch for it could only produce a "
        "stretched or invented backdrop -- returning null is the correct answer, not a bug. All "
        "115 combat asset path literals in the app are .DAX or .DAA, so the gap hides 0 frames "
        "today.",
    ),
}

# Source evidence that each declared catch-all really is what it claims to be.
CATCHALL_EVIDENCE: dict[Path, re.Pattern[str]] = {
    LOADGAME: re.compile(r"^[ \t]*// dax[ \t]*\r?\n[ \t]*const a = decoded\.archive;", re.M),
    MAIN: re.compile(r"^[ \t]*// dax[ \t]*\r?\n[ \t]*const a = decoded\.archive;", re.M),
    # The terminal `else` arm dereferences `.image.image`, which only the ILBM member has.
    NWNPREVIEW: re.compile(r"\}\s*else\s*\{[^}]*decoded\.image\.image", re.S),
}

# `[\w-]+`, not `\w+`: `pool-amiga` is hyphenated, and a hyphen-blind character class is
# exactly the bug that hid this same format from `engine_export_consumers.py` the same round.
_UNION_DECL = re.compile(r"^export type DecodedAsset\s*=\s*$", re.M)
_UNION_MEMBER = re.compile(r"^\s*\|\s*\{\s*format:\s*'([\w-]+)'")
# Both comparison directions. `!==` is a dispatch too -- see this module's docstring.
_BRANCH = re.compile(r"decoded\.format\s*(?:===|!==)\s*'([\w-]+)'")


def read(rel: Path) -> str:
    return (REPO / rel).read_text(encoding="utf-8")


def strip_comments(src: str) -> str:
    """Blank out line and block comments, string-aware so a `//` inside a literal survives.

    Needed because a prose sentence such as ``// the `decoded.format === 'hlib'` branch`` would
    otherwise register as a dispatch, and a site could be "covered" by a comment about it. Kept
    deliberately small and pinned by its own unit test below: a stripper that ate real code
    would empty the enumeration and make every downstream assertion free.
    """
    out: list[str] = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                i += 1
            continue
        if c == "/" and nxt == "*":
            i += 2
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                if src[i] == "\n":
                    out.append("\n")
                i += 1
            i += 2
            continue
        if c in "\"'`":
            # String literals are COPIED VERBATIM, not blanked: the format token being matched
            # (`'hlib'`) lives inside one, so a stripper that emptied literals would return an
            # empty enumeration and make every downstream check pass by vacuum. That is exactly
            # what this function's first draft did; `test_stripper_removes_prose_but_keeps_code`
            # is what caught it. The residual risk runs the other way -- a string that happens to
            # contain the whole phrase becomes a false POSITIVE, which ADDS a site to the audit
            # rather than hiding one.
            quote = c
            out.append(quote)
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\" and i + 1 < n:
                    out.append(src[i])
                    out.append(src[i + 1])
                    i += 2
                    continue
                out.append(src[i])
                i += 1
            if i < n:
                out.append(quote)
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def union_formats() -> set[str]:
    """Parse the `DecodedAsset` union line by line.

    Line-based deliberately: a non-greedy `(.*?);` block match stops at the first `;`, which
    sits inside `{ format: 'hlib'; archive: HlibArchive }`, giving a one-member union.
    """
    src = read(UNION_FILE)
    decl = _UNION_DECL.search(src)
    assert decl, "could not locate `export type DecodedAsset =` in index.ts"
    out: set[str] = set()
    for line in src[decl.end():].splitlines()[1:]:
        member = _UNION_MEMBER.match(line)
        if not member:
            break  # first line that is not a `| { format: '...' }` arm ends the union
        out.add(member.group(1))
    return out


def enumerate_dispatch_sites() -> dict[Path, set[str]]:
    """Every product source file that compares `decoded.format` against a literal.

    This is the check the previous version of this file could not perform on itself: the site
    list is derived, not declared, so a new dispatch in a file nobody thought to add shows up
    here instead of silently taking its formats' coverage with it.
    """
    found: dict[Path, set[str]] = {}
    for root in SCAN_ROOTS:
        for path in sorted((REPO / root).rglob("*.ts")):
            if path.name.endswith(".d.ts"):
                continue
            formats = set(_BRANCH.findall(strip_comments(path.read_text(encoding="utf-8"))))
            if formats:
                found[path.relative_to(REPO)] = formats
    return found


def explicit_branches(rel: Path) -> set[str]:
    return set(_BRANCH.findall(strip_comments(read(rel))))


# ---------------------------------------------------------------------------------------
# Guards on the machinery itself
# ---------------------------------------------------------------------------------------


def test_union_is_parsed_and_nonempty() -> None:
    """Guard 1: pin the union so a regex that matches nothing fails here, not everywhere."""
    assert union_formats() == {"hlib", "glib", "ilbm", "daa", "dax", "pool-amiga"}


def test_stripper_removes_prose_but_keeps_code() -> None:
    """Guard 4: the stripper must not be able to empty (or fabricate) the enumeration.

    The `'https://'` assertion is the one that earned its place twice over. The first draft of
    `strip_comments` blanked string CONTENTS as well as comments, which deleted the very
    `'hlib'` literal `_BRANCH` matches: every site enumerated as EMPTY and six checks in this
    file went green-by-vacuum on a run where nothing worked. Keeping literals means a `//`
    inside one must not start a comment either, which is what this checks.
    """
    sample = (
        "// decoded.format === 'hlib' in a line comment\n"
        "/* decoded.format === 'glib' in a block comment */\n"
        "const url = 'https://example.invalid/x';\n"
        "if (decoded.format === 'dax') { a(); }\n"
        "if (decoded.format !== 'ilbm') { b(); }\n"
    )
    stripped = strip_comments(sample)
    # Comments gone, code kept, both comparison forms seen.
    assert set(_BRANCH.findall(stripped)) == {"dax", "ilbm"}
    assert "hlib" not in stripped and "glib" not in stripped
    # ...and it must not be a stripper that deletes everything, nor one that treats the `//` in
    # a URL literal as a comment.
    assert "if (decoded.format" in stripped
    assert "'https://example.invalid/x'" in stripped


def test_enumerated_sites_match_the_declared_ones() -> None:
    """The round-35 check: the declaration must cover exactly what the source contains.

    Seen RED on HEAD before the sites were classified (enumerated 5 vs declared 3, the two
    unseen being intro.ts and combat.ts).
    """
    enumerated = set(enumerate_dispatch_sites())
    declared = set(SITE_CATCHALL) | set(DOCUMENTED_EXCLUSIONS)
    assert enumerated, "no dispatch sites enumerated at all -- the scanner or the roots are wrong"
    missing = sorted(p.as_posix() for p in enumerated - declared)
    stale = sorted(p.as_posix() for p in declared - enumerated)
    assert not missing, (
        "dispatch sites the audit does not classify (each needs a catch-all declaration or a "
        "documented exclusion):\n  " + "\n  ".join(missing)
    )
    assert not stale, "declared dispatch sites that no longer dispatch:\n  " + "\n  ".join(stale)


def test_dispatch_site_list_is_complete() -> None:
    """Guard 2: the sites exist and each really parses branches.

    A site that was renamed, or whose dispatch was restructured away from a `decoded.format`
    comparison, must fail here rather than quietly leave the coverage set.
    """
    for rel in list(SITE_CATCHALL) + list(DOCUMENTED_EXCLUSIONS):
        assert (REPO / rel).exists(), f"dispatch site missing: {rel}"
        branches = explicit_branches(rel)
        assert len(branches) >= 2, f"{rel} parsed only {sorted(branches)} -- dispatch restructured?"


def test_each_declared_catchall_is_evidenced_in_the_source() -> None:
    """Guard 3: a catch-all is credited only where the source actually has one.

    Without this, `SITE_CATCHALL` is an unchecked assertion that a format is handled, and a
    deleted fallthrough would still read as covering its format.
    """
    for rel, fmt in SITE_CATCHALL.items():
        assert CATCHALL_EVIDENCE[rel].search(read(rel)), (
            f"{rel.as_posix()} is declared to catch '{fmt}' but the source no longer shows "
            "that catch-all"
        )


def test_catchall_covers_exactly_one_format_each() -> None:
    """The catch-alls are format-specific, not generic.

    If a catch-all ever became genuinely generic, every per-site assertion below would pass
    for free. Each is pinned to a single format, and the two DAX ones are distinct files.
    """
    assert sorted(SITE_CATCHALL.values()) == ["dax", "dax", "ilbm"]
    assert len(SITE_CATCHALL) == 3


def test_every_format_is_handled_at_every_flattening_site() -> None:
    """The actual check. A new format must be taught all three flattening sites, not one."""
    formats = union_formats()
    missing: list[str] = []
    for rel, catchall in SITE_CATCHALL.items():
        covered = explicit_branches(rel) | {catchall}
        for fmt in sorted(formats - covered):
            missing.append(f"{rel.as_posix()} does not handle format '{fmt}'")
    assert not missing, "unhandled DecodedAsset formats:\n  " + "\n  ".join(missing)


def test_selector_sites_drop_exactly_what_they_say_they_drop() -> None:
    """A selector site's stated gap must equal its real one -- no more, no fewer.

    This is what stops an exclusion entry from becoming the same kind of stale prose the site
    list itself was. If `intro.ts` grows a `glib` branch, or loses its `hlib` one, the declared
    set stops matching and this fails.
    """
    formats = union_formats()
    for rel, (declared_gap, reason) in DOCUMENTED_EXCLUSIONS.items():
        actual_gap = formats - explicit_branches(rel)
        assert actual_gap == set(declared_gap), (
            f"{rel.as_posix()} drops {sorted(actual_gap)} but the audit documents "
            f"{sorted(declared_gap)}"
        )
        assert len(reason) > 80, f"{rel.as_posix()}'s exclusion needs a real reason, not a label"
        assert "0 frames" in reason, (
            f"{rel.as_posix()}'s exclusion must state the measured number of frames it hides "
            "today, not merely assert the gap is harmless"
        )


def test_pool_amiga_specifically_is_branched_not_fallen_through() -> None:
    """The regression this file was written for.

    `pool-amiga` must be an EXPLICIT branch at every FLATTENING site, never merely reached by a
    DAX catch-all: that body's multi-frame allowlist is written for DAX block kinds, and
    pool-amiga's multi-frame blocks carry `kind: 'standard'`, which `decodeDax` never emits.
    Being "covered" by the fallthrough IS the bug -- 744 of 1672 frames in `loadGame.ts`, and
    a container mislabelled `DAX` in `main.ts`.
    """
    for rel in SITE_CATCHALL:
        assert "pool-amiga" in explicit_branches(rel), (
            f"{rel.as_posix()} has no explicit pool-amiga branch; a DAX fallthrough is not "
            "equivalent (kind 'standard' multi-frame blocks would collapse to one frame each)"
        )


def test_composites_reach_every_flattening_site() -> None:
    """Round 35 R3: the same bug one field deeper.

    `HlibArchive.composites` / `GlibArchive.composites` are deliberately kept OUT of `images` so
    positional member indices never shift, which means every flattening site has to opt in. From
    2026-08-22 to 2026-09-05 exactly one did (`main.ts`), so `?game=dark-queen-dos` dropped 3
    composites and `?game=forgotten-realms-unlimited-adventures` dropped 9. A site that handles
    the `hlib` FORMAT but not its composites passes every other check in this file.
    """
    for rel in SITE_CATCHALL:
        body = strip_comments(read(rel))
        assert "composites" in body, (
            f"{rel.as_posix()} flattens an HLIB/GLIB archive but never reads `.composites`; "
            "method-25 / method-0x19 members would be dropped there"
        )


# ---------------------------------------------------------------------------------------
# The prose count must track the union.
#
# `docs/findings.md` is the doc `README.md` names as the authoritative format synthesis. Its
# section-2 heading historically carried "three" from before `GLIB` (2026-08-22) and
# `pool-amiga` (2026-09-03) existed -- two whole containers out of date, with no test able
# to notice. The same stale count appeared in CLAUDE.md before project facts moved to
# README.md. These two checks tie the findings and project overview counts to the union.
#
# `ilbm` is deliberately excluded: IFF/ILBM is a single-image format, not a container, and the
# findings table does not list it. So the container count is `len(union) - 1`, and that
# subtraction is asserted rather than hardcoded, so adding a seventh format moves both numbers
# together instead of only the one someone remembered.
# ---------------------------------------------------------------------------------------

_NUMBER_WORDS = {
    3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
}

NON_CONTAINER_FORMATS = frozenset({"ilbm"})


def container_format_count() -> int:
    formats = union_formats()
    assert NON_CONTAINER_FORMATS <= formats, "ilbm left the union; revisit this exclusion"
    return len(formats - NON_CONTAINER_FORMATS)


def test_findings_synthesis_states_the_current_container_count() -> None:
    word = _NUMBER_WORDS[container_format_count()]
    heading = f"## 2. The {word} container formats (VERIFIED by magic bytes)"
    body = read(Path("docs/findings.md"))
    assert heading in body, (
        f"docs/findings.md section 2 does not say {word!r}; the union currently has "
        f"{container_format_count()} container formats "
        f"({sorted(union_formats() - NON_CONTAINER_FORMATS)})"
    )
    # ...and the table really lists each one, so the heading is not just a number that agrees
    # with the union while the rows below it stay short.
    for fmt in sorted(union_formats() - NON_CONTAINER_FORMATS):
        needle = {"dax": "**DAX**", "daa": "**DAA**", "hlib": '**HLIB "DataLib"**',
                  "glib": "**GLIB**", "pool-amiga": "**Pool-Amiga**"}.get(fmt)
        assert needle is not None, f"no findings.md row marker registered for format {fmt!r}"
        assert needle in body, f"docs/findings.md has no table row for {fmt!r} ({needle})"


def test_readme_md_does_not_understate_the_container_count() -> None:
    body = read(Path("README.md"))
    stale = "Three container generations are in play"
    assert stale not in body, (
        "README.md still claims three container generations; the union has "
        f"{container_format_count()}"
    )
    word = _NUMBER_WORDS[container_format_count()]
    assert f"**{word.capitalize()}** container formats are in play" in body, (
        f"README.md's format overview does not state the current count ({word})"
    )
