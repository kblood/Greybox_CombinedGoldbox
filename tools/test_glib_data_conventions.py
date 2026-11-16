"""
GLIB `DATA` conventions, measured across the whole Amiga corpus -- 2026-08-24.

Two claims that `hlib-format.md` had established on the DOS side were left explicitly untested
against the Amiga `GLIB` siblings. Both are settled here, over all 152 `GLIB`-magic files in the
six DataLib-era Amiga ports.

1. **The member-0 id table is present iff `magic == 1`.** `glib-format.md` verified this on exactly
   one file (`GEO.GLB`). It holds in 117 of 117 `magic == 1` files and 0 of 35 `magic == 0` ones,
   across every tag -- so it is a container property, not a property of `TILE` or of `DATA`. The
   `magic == 0` group is the null, and it contains 26 `TILE` leaves, so it is not merely the
   non-image tags scoring zero by construction.

2. **The big-endian uncompressed-length word is an engine-generation convention, not a `MONCHA`
   one.** All six Amiga bestiaries split cleanly in two, and three traits co-vary:

   | Title | tag | records | storage | record size | length word |
   | --- | --- | ---: | --- | ---: | --- |
   | Dark Queen of Krynn | DATA | 98 | monchaRLE after the word | variable 408..606 | **yes** |
   | Pools of Darkness | DATA | 122 | monchaRLE after the word | variable 406..586 | **yes** |
   | Curse of the Azure Bonds | DATA | 78 | monchaRLE from byte 0 | fixed 422 | no |
   | Secret of the Silver Blades | DATA | 70 | monchaRLE from byte 0 | fixed 440 | no |
   | Gateway to the Savage Frontier | GLIB(!) | 69 | uncompressed | fixed 422 | no |
   | Treasures of the Savage Frontier | GLIB(!) | 130 | uncompressed | fixed 422 | no |

   The four pre-DQK games share one record layout -- `u8 nameLen` then the name -- while the two
   DQK-era ones put the name at a fixed offset (0x68 on DOS DQK). That gives the Pascal-name test
   below a built-in null: it must score 0 on DQK and Pools, and does.

   Gateway and Treasures additionally tag their bestiary `GLIB`, the MASTER tag, while holding no
   nested container at all (0 of 69 and 0 of 130 members carry the GLIB magic). `glib-format.md`
   noted this mis-tagging for Treasures; it applies to Gateway too.

   The tempting rule "the word appears iff the record size varies" is WRONG, and DOS FRUA is the
   counterexample that kills it: every `MONST.GLB` record is 450 bytes and it carries the word
   anyway. What survives is the generation split -- DQK-era containers carry it whether or not they
   need it. FRUA is where it is redundant, which is exactly why it was long mis-read there as a
   fixed "01 C2 record marker" (0x01C2 = 450).

Amiga sources live outside the repo and are never vendored; absent source => skip.
"""
import os
import sys
from collections import Counter

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import glib_decode  # noqa: E402
from moncha_rle import moncha_rle  # noqa: E402

WHDLOAD = (r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection"
           r"\Games-WHDLoad\unpacked")
TITLES = ["DarkQueenOfKrynn", "PoolsOfDarkness", "CurseOfTheAzureBonds",
          "SecretOfTheSilverBlades", "GatewayToSavageFrontier",
          "TreasuresOfSavageFrontier"]


# The MONCHA run-length variant (c<0x80 copy c+1, c>0x80 repeat 257-c, c==0x80 a no-op)
# lives in tools/moncha_rle.py; this file carried a private copy until 2026-09-07.
_moncha_rle = moncha_rle


def _containers():
    if not os.path.isdir(WHDLOAD):
        pytest.skip("absent (never-vendored Amiga WHDLoad source)")
    out = []
    for title in TITLES:
        root = os.path.join(WHDLOAD, title)
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, names in os.walk(root):
            for name in sorted(names):
                path = os.path.join(dirpath, name)
                try:
                    raw = open(path, "rb").read()
                except OSError:
                    continue
                if raw[:4] != b"GLIB":
                    continue
                full = glib_decode.load_container(raw)
                out.append((title, name, glib_decode.read_header(full), full))
    if not out:
        pytest.skip("no Amiga GLIB titles present under the WHDLoad root")
    return out


def _is_id_table(full, ptrs):
    span = ptrs[1] - ptrs[0]
    if span < 2 or ptrs[0] + 2 > len(full):
        return False
    n = int.from_bytes(full[ptrs[0]:ptrs[0] + 2], "big")
    return span == 2 + 4 * n


def test_the_member_0_id_table_is_present_exactly_when_magic_is_1():
    libs = _containers()
    assert len(libs) == 152, "the survey covers every GLIB file in the six ports"
    by_magic = Counter()
    exceptions = []
    for title, name, hdr, full in libs:
        ptrs = hdr["ptrs"]
        if len(ptrs) < 2:
            continue
        ok = _is_id_table(full, ptrs)
        by_magic[(hdr["magic"], ok)] += 1
        if bool(ok) != (hdr["magic"] == 1):
            exceptions.append("%s/%s magic=%d table=%s" % (title, name, hdr["magic"], ok))
    assert exceptions == []
    assert by_magic[(1, True)] == 117
    # The null. Without it "every file has a table" would score 117/117 too.
    assert by_magic[(0, False)] == 35
    assert by_magic[(1, False)] == 0
    assert by_magic[(0, True)] == 0


def test_the_magic_0_null_is_not_just_the_non_image_tags():
    """26 of the 35 magic==0 files are TILE leaves, so the null is not a tag artifact."""
    libs = _containers()
    tags = Counter(h["tag"].decode("latin1") for _t, _n, h, _f in libs if h["magic"] == 0)
    assert tags["TILE"] == 26
    assert sum(tags.values()) == 35


# The six Amiga bestiaries, and they split cleanly into two generations.
#   title -> (records, carries the BE length word, storage, record size)
# "rle" = monchaRLE from byte 0; "rle+len" = the same after a 2-byte BE length word;
# "raw" = not compressed at all. Sizes are the DECOMPRESSED record size, or None when variable.
BESTIARIES = {
    "DarkQueenOfKrynn":          (98,  True,  "rle+len", None),
    "PoolsOfDarkness":           (122, True,  "rle+len", None),
    "CurseOfTheAzureBonds":      (78,  False, "rle",     422),
    "SecretOfTheSilverBlades":   (70,  False, "rle",     440),
    "GatewayToSavageFrontier":   (69,  False, "raw",     422),
    "TreasuresOfSavageFrontier": (130, False, "raw",     422),
}

# Gateway and Treasures tag their bestiary "GLIB" -- the MASTER tag -- but no member is a nested
# container (0 of 69 and 0 of 130 carry the GLIB magic). This is the mis-tagging glib-format.md
# noted for Treasures; it applies to Gateway too, and the payload is ordinary monster records.
MISTAGGED = {"GatewayToSavageFrontier", "TreasuresOfSavageFrontier"}


def _bestiaries():
    out = {}
    for title, name, hdr, full in _containers():
        if name.upper() != "MONCHA.GLB":
            continue
        ptrs = hdr["ptrs"]
        records = list(range(1 if hdr["magic"] == 1 else 0, len(ptrs) - 1))
        with_word = sum(
            1 for i in records
            if int.from_bytes(full[ptrs[i]:ptrs[i] + 2], "big")
            == len(_moncha_rle(full[ptrs[i] + 2:ptrs[i + 1]]))
        )
        out[title] = (hdr, full, ptrs, records, with_word)
    return out


def test_all_six_amiga_bestiaries_are_present_and_two_are_mis_tagged_as_masters():
    found = _bestiaries()
    assert set(found) == set(BESTIARIES)
    for title, (hdr, full, ptrs, records, _w) in found.items():
        tag = hdr["tag"].decode("latin1")
        assert len(records) == BESTIARIES[title][0], title
        if title in MISTAGGED:
            assert tag == "GLIB", title
            nested = sum(1 for i in records if full[ptrs[i]:ptrs[i] + 4] == b"GLIB")
            assert nested == 0, "%s claims to be a master but holds no nested container" % title
        else:
            assert tag == "DATA", title


def test_the_length_word_splits_the_bestiaries_by_engine_generation():
    for title, (hdr, full, ptrs, records, with_word) in _bestiaries().items():
        expect_word = BESTIARIES[title][1]
        # All-or-nothing: a partial score would mean the predicate is fitting noise.
        assert with_word in (0, len(records)),             "%s is not all-or-nothing: %d/%d" % (title, with_word, len(records))
        assert (with_word == len(records)) is expect_word, title


def test_the_record_size_is_fixed_wherever_the_length_word_is_absent():
    """And variable in both libraries that carry it -- which is where it is load-bearing."""
    for title, (hdr, full, ptrs, records, with_word) in _bestiaries().items():
        _recs, carries, storage, size = BESTIARIES[title]
        skip = 2 if storage == "rle+len" else 0
        lens = [
            (ptrs[i + 1] - ptrs[i]) if storage == "raw"
            else len(_moncha_rle(full[ptrs[i] + skip:ptrs[i + 1]]))
            for i in records
        ]
        if size is None:
            assert carries is True, title
            assert len(set(lens)) > 1, "%s: the declared size earns its keep" % title
        else:
            assert carries is False, title
            assert set(lens) == {size}, title


def test_every_pre_dqk_bestiary_record_opens_with_a_pascal_style_name():
    """CoAB, Secret, Gateway and Treasures share one record layout: u8 nameLen, then the name.

    The two DQK-era libraries do NOT -- their name sits at a fixed offset (0x68 on DOS DQK), so
    this predicate scoring 0 there is the null that makes the four 100% scores mean something.
    """
    scores = {}
    for title, (hdr, full, ptrs, records, with_word) in _bestiaries().items():
        _recs, _carries, storage, _size = BESTIARIES[title]
        skip = 2 if storage == "rle+len" else 0
        named = 0
        for i in records:
            body = full[ptrs[i]:ptrs[i + 1]]
            rec = body if storage == "raw" else _moncha_rle(body[skip:])
            n = rec[0] if rec else 0
            if 1 <= n <= 24 and len(rec) > 1 + n and all(32 <= b < 127 for b in rec[1:1 + n]):
                named += 1
        scores[title] = (named, len(records))
    for title, (named, total) in scores.items():
        if BESTIARIES[title][3] is None:  # the two DQK-era libraries
            assert named == 0, "%s must NOT match the Pascal-name layout: %d/%d" % (
                title, named, total)
        else:
            assert named == total, "%s: %d/%d" % (title, named, total)


def test_the_dqk_generation_carries_the_word_even_where_it_is_redundant():
    """DOS FRUA is the counterexample to "the word appears iff the record size varies"."""
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frua = "C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK2/MONST.GLB"
    dqk = os.path.join(repo, "The Dark Queen of Krynn", "DISK2", "MONCHA.GLB")
    for path in (frua, dqk):
        if not os.path.exists(path):
            pytest.skip("absent: %s" % path)
    out = {}
    for label, path in (("FRUA", frua), ("DQK", dqk)):
        b = open(path, "rb").read()
        count = int.from_bytes(b[8:10], "little") + 1
        ptrs = [int.from_bytes(b[16 + 4 * i:20 + 4 * i], "little") for i in range(count)]
        lens = [len(_moncha_rle(b[ptrs[i] + 2:ptrs[i + 1]])) for i in range(1, len(ptrs) - 1)]
        hits = sum(
            1 for i in range(1, len(ptrs) - 1)
            if int.from_bytes(b[ptrs[i]:ptrs[i] + 2], "big")
            == len(_moncha_rle(b[ptrs[i] + 2:ptrs[i + 1]]))
        )
        out[label] = (len(lens), hits, len(set(lens)))
    # FRUA: every record the same size, and the word is there anyway.
    assert out["FRUA"] == (127, 127, 1)
    # DQK: the word is load-bearing -- 31 distinct decompressed sizes.
    assert out["DQK"] == (98, 98, 31)
