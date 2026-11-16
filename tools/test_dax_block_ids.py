"""DAX block ids are NOT unique, and the whole DOS corpus adds up exactly.

Two facts about the container that nothing checked before 2026-08-25.

The first is a corpus-wide null for the layout in `docs/dax-format.md` §1: across every DOS
`.DAX` we hold -- 11 titles, 636 files -- the `data_offset` chain is contiguous and the last
block ends **exactly** at EOF, 636 times out of 636. A header reading that were merely
plausible would not do that; the superseded two-word reading this replaced put `8X8D1.DAX`'s
data at 489 instead of 74 and no check ever objected.

The second is the surprise. `block_id` is documented as sparse, and it turns out not to be
unique either: three Champions of Krynn files ship the same id twice. Two of the three pairs
are byte-identical (harmless duplication), but `SPRIT2.DAX` id 14 is **two different sprites**
-- 3-frame animation arrays of 56x80/32x65/24x57 and 48x80/40x65/24x57, each consuming its
block exactly. So any consumer that resolves a block by id has to pick, and the codebase does
not pick consistently: `.find()` (first wins) in `cokFont.ts` and `dqkArtMap.ts`,
`new Map(blocks.map(b => [b.blockId, b.raw]))` (last wins) in four `apps/web/src/ui` modules.

**Which one the retail engine uses is UNLOCATED**, and these tests deliberately do not assert
one. What was tried and did not work, so the next attempt does not repeat it:
  * the COAB C# decompile (`DaxFileCache.cs`) calls `Dictionary.Add`, which throws on a
    duplicate key -- it would crash on this file rather than choose, so it is not an oracle;
  * `add reg,9` (the obvious TOC-scan stride) does not occur in CoK's `GAME.OVR` or
    `START.EXE` at all, so the scan was not found by that signature;
  * the Amiga `SPRIT2.DAA` carries id 14 exactly once, but every sub-block is a uniform 88x88
    canvas, so geometry cannot discriminate -- and a bounding-box measurement returned the
    full 88x88 for all 17 blocks including the ones with unambiguous DOS twins, which is the
    control that says the method does not work rather than that it favours one candidate.

What IS asserted is that the ambiguity stays visible: the loaders must keep both entries, and
the counts above must not drift silently.
"""
import os
import struct
import sys
from collections import Counter

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import dax_inspect  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOG = r"C:/Program Files (x86)/GOG Galaxy/Games"

# The repo's own two GOG copies are vendored, so the CoK half of this file always runs.
VENDORED = [os.path.join(REPO, "Champions of Krynn"), os.path.join(REPO, "Death Knights of Krynn")]
EXTERNAL = [
    f"{GOG}/{t}"
    for t in (
        "Pool of Radiance",
        "Curse of the Azure Bonds",
        "Secret of the Silver Blades",
        "Pools of Darkness",
        "Champions of Krynn",
        "Death Knights of Krynn",
        "Gateway to the Savage Frontier",
        "Treasures of the Savage Frontier",
    )
] + [r"D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday"]

# id -> (entries, distinct duplicated ids). Champions only; nothing else in the corpus has any.
KNOWN_DUPLICATES = {"PIC1.DAX": 34, "SPRIT2.DAX": 14, "SPRIT3.DAX": 35}


def _dax_files(roots):
    out = []
    for r in roots:
        if not os.path.exists(r):
            continue
        for dirpath, _dirs, names in os.walk(r):
            out += [os.path.join(dirpath, n) for n in names if n.upper().endswith(".DAX")]
    return sorted(out)


def _decompress(data, base, entry):
    comp = data[base + entry["data_offset"]: base + entry["data_offset"] + entry["comp_size"]]
    out = bytearray()
    i = 0
    while i < len(comp):
        c = comp[i]
        i += 1
        if c < 0x80:
            out += comp[i: i + c + 1]
            i += c + 1
        else:
            out += bytes([comp[i]]) * (256 - c)
            i += 1
    return bytes(out)


def test_every_dos_dax_chain_closes_exactly_on_eof():
    """The layout's corpus-wide null. One failure means the header reading is wrong."""
    files = _dax_files(VENDORED + EXTERNAL)
    assert len(files) >= 100, f"expected the vendored CoK+DoK sets at minimum, got {len(files)}"
    bad = []
    for path in files:
        data = open(path, "rb").read()
        try:
            base, entries = dax_inspect.parse_toc(data)
        except ValueError as exc:
            bad.append((path, str(exc)))
            continue
        problems = dax_inspect.verify(data, base, entries)
        if problems:
            bad.append((path, problems[0]))
    assert bad == [], bad


def test_the_verifier_can_fail():
    """Positive control. Without this the sweep above is a rubber stamp."""
    path = os.path.join(REPO, "Champions of Krynn", "8X8D1.DAX")
    data = open(path, "rb").read()
    base, entries = dax_inspect.parse_toc(data)
    assert dax_inspect.verify(data, base, entries) == []
    assert dax_inspect.verify(data[:200], base, entries) != []


def test_block_ids_repeat_in_exactly_three_champions_files():
    files = _dax_files(VENDORED + EXTERNAL)
    found = {}
    for path in files:
        data = open(path, "rb").read()
        try:
            _base, entries = dax_inspect.parse_toc(data)
        except ValueError:
            continue
        counts = Counter(e["block_id"] for e in entries)
        dups = sorted(k for k, v in counts.items() if v > 1)
        if dups:
            found.setdefault(os.path.basename(path).upper(), set()).update(dups)
    assert {k: sorted(v) for k, v in found.items()} == {
        name: [dup] for name, dup in KNOWN_DUPLICATES.items()
    }, found
    # The null for "duplicates are a real property and not an artefact of the reader": the vast
    # majority of files have none, so the predicate is not simply always true.
    assert len(found) < len(files) * 0.02


@pytest.mark.parametrize(
    "name,dup,identical",
    [("PIC1.DAX", 34, True), ("SPRIT2.DAX", 14, False), ("SPRIT3.DAX", 35, True)],
)
def test_only_sprit2_id_14_is_genuinely_two_different_blocks(name, dup, identical):
    path = os.path.join(REPO, "Champions of Krynn", name)
    data = open(path, "rb").read()
    base, entries = dax_inspect.parse_toc(data)
    same = [e for e in entries if e["block_id"] == dup]
    assert len(same) == 2
    payloads = [_decompress(data, base, e) for e in same]
    assert (payloads[0] == payloads[1]) is identical, name
    if not identical:
        # Both are well-formed and consume their block exactly -- neither is truncated junk that
        # could be dismissed as a packer accident.
        assert len(payloads[0]) == 4028 and len(payloads[1]) == 3968
        import subframe_decode

        geo = []
        for p in payloads:
            parsed = subframe_decode.parse_anim_array(p)
            assert parsed is not None
            frames, consumed = parsed
            assert consumed == len(p), "an animation array that does not fill its block"
            geo.append([(f["width"], f["height"]) for f in frames])
        assert geo == [
            [(56, 80), (32, 65), (24, 57)],
            [(48, 80), (40, 65), (24, 57)],
        ], geo
