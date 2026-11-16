"""Round 36 R6: the capability ledger's Treasures/Pools import-roster claims, checked against
the retail bytes they describe.

WHY THIS FILE EXISTS. Round 35 R4 moved the Treasures import roster (CHERROD became a legal
half-elf under the title's OWN race table and took the sixth party slot, so OUGO is now cut by
the six-hero cap instead of joining). `tools/goldbox_capabilities.json` said nothing about any
of it -- measured before the edit that this file guards, the `treasures-of-the-savage-frontier`
profile contained **0** occurrences each of `OUGO`, `CHERROD`, `SMOKE`, `pregen` and `party cap`,
and the `pools-of-darkness` profile **0** each of `BINKY`, `ABAGAIL`, `pregen` and `party cap`.
So round 36 R6's ledger work was an ADDITION, not a correction, and this file is the pin that
addition previously lacked. A claim in the ledger with nothing able to falsify it is the shape
this project has retracted findings over.

TWO ARMS, DELIBERATELY DIFFERENT ABOUT SKIPPING.

* `LedgerProseTests` needs no external data and therefore **cannot skip**. It reads the ledger
  only. If the roster sentences, the counts, or the preserved
  "argued by consequence, indexing instruction not located" label are edited away or edited
  wrong, these fail. `imul r16, imm8` has zero hits in these 8086-targeted builds, so the
  0-based race-byte read is an argument from consequence and the ledger may not call it proven;
  `test_the_argued_by_consequence_label_is_preserved` is what stops that upgrade.

* `LedgerAgainstRetailBytesTests` re-derives every byte fact the ledger states from the GOG
  installs' own `SAVE/CHRDATA{n}.SAV` records and compares. Those installs are REFERENCED, never
  vendored, so this arm **skips** when they are absent -- and a test that can skip itself can
  pass without running, which is why the prose arm above exists separately and unconditionally.
  Nothing here re-uses the engine's own decoder: the offsets are read straight out of the raw
  records, so a change to `poolsTreasuresSavedCharacter.ts` cannot make its own claims true.

The numbers are not hardcoded twice. Each byte-arm test EXTRACTS the figure from the ledger
prose and compares it to the figure computed from the bytes, so a wrong number in either place
is red.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CAPABILITIES_JSON = REPO_ROOT / "tools" / "goldbox_capabilities.json"

GOG = Path(r"C:\Program Files (x86)\GOG Galaxy\Games")
TREASURES_SAVE = GOG / "Treasures of the Savage Frontier" / "SAVE"
POOLS_SAVE = GOG / "Pools of Darkness" / "SAVE"

RECORD_SIZE = 510
OFF_RACE = 0xAD
OFF_CLASS = 0xAE
OFF_CLASS_LEVEL = 0x151
CLASS_LEVEL_SLOTS = 8
PARTY_CAP = 6

# `SkillType` slot order, transcribed in `coabSavedCharacter.ts` from CoAB's own `Enums.cs:57-67`
# and shared by this 510-byte layout. Named here so the "slot 0 is CLERIC" claim about OUGO is
# checked against an order, not against a memory of one.
SLOT_ORDER = (
    "cleric", "druid", "fighter", "paladin", "ranger", "magic_user", "thief", "monk",
)
# `ClassId`, same source. Only the codes the two titles' fourteen records actually use are needed,
# but the whole table is transcribed so a drifted code shows up as a KeyError, not as a silent miss.
CLASS_CODE = {
    0: ("cleric",), 1: ("druid",), 2: ("fighter",), 3: ("paladin",), 4: ("ranger",),
    5: ("magic_user",), 6: ("thief",), 7: ("monk",),
    8: ("cleric", "fighter"), 9: ("cleric", "fighter", "magic_user"),
    10: ("cleric", "ranger"), 11: ("cleric", "magic_user"), 12: ("cleric", "thief"),
    13: ("fighter", "magic_user"), 14: ("fighter", "thief"),
    15: ("fighter", "magic_user", "thief"), 16: ("magic_user", "thief"),
}


def _import_entry(profile_id: str) -> dict:
    data = json.loads(CAPABILITIES_JSON.read_text(encoding="utf-8"))
    profile = next(p for p in data["profiles"] if p["profile_id"] == profile_id)
    return profile["capabilities"]["retail_save"]["import"]


def _import_text(profile_id: str) -> str:
    entry = _import_entry(profile_id)
    return " ".join([entry.get("scope", ""), *entry.get("gaps", [])])


def _records(save_dir: Path, count: int) -> list[tuple[str, bytes]]:
    """[(name, raw)] for CHRDATA1..count, in file order -- which is the order the importer
    walks and therefore the order the party cap bites in."""
    out: list[tuple[str, bytes]] = []
    for n in range(1, count + 1):
        raw = (save_dir / f"CHRDATA{n}.SAV").read_bytes()
        out.append((raw[1:1 + raw[0]].decode("latin1").strip(), raw))
    return out


def _records_by_name(save_dir: Path, count: int) -> dict[str, tuple[str, bytes]]:
    """name -> (filename, raw) for CHRDATA1..count.

    Round 36 R6's ledger names the exact save file a "disagrees WITH HERSELF" hero's bytes
    came from ("In SAVE/CHRDATA5.SAV her class byte..."). The verifier found that claim
    unpinned in both directions: nothing checked the filename, and (Pools only) nothing
    checked the class-byte-vs-name pairing it introduces either -- both could be edited to a
    wrong-but-plausible value with every existing assertion staying green. This helper keeps
    the filename attached to each record so a test can check the name against the byte
    contents it actually came from, not just against a name string floating in the ledger.
    """
    out: dict[str, tuple[str, bytes]] = {}
    for n in range(1, count + 1):
        filename = f"CHRDATA{n}.SAV"
        raw = (save_dir / filename).read_bytes()
        name = raw[1:1 + raw[0]].decode("latin1").strip()
        out[name] = (filename, raw)
    return out


_JOIN_LIST = re.compile(r"(\d+) join in file order -- ([A-Z, ]+?) -- with")


def _stated_join_list(text: str) -> tuple[int, list[str]]:
    """The join count and the ORDERED names the ledger says join.

    Parsed as a list, not searched for member-wise: a first draft of this file asserted only
    `name in text` for each expected hero, and swapping CHERROD for OUGO in the sentence stayed
    GREEN because both names appear elsewhere in the same blob. That mutation is the reason this
    helper exists -- see the module doc's note on checks that cannot fail.
    """
    m = _JOIN_LIST.search(text)
    assert m is not None, "the ledger no longer states a '<n> join in file order -- ... -- with' list"
    return int(m.group(1)), [n.strip() for n in m.group(2).split(",")]


def _class_level(raw: bytes) -> list[int]:
    return list(raw[OFF_CLASS_LEVEL:OFF_CLASS_LEVEL + CLASS_LEVEL_SLOTS])


def _agrees(raw: bytes) -> bool:
    """The class byte's expected nonzero level slots vs the record's actual ones -- the same
    two-field oracle `poolsTreasuresClassLevelAgrees` implements, reimplemented here from the
    enum order so this pin does not adjudicate the engine with the engine."""
    expected = set(CLASS_CODE[raw[OFF_CLASS]])
    actual = {SLOT_ORDER[i] for i, v in enumerate(_class_level(raw)) if v}
    return expected == actual


def _saves_present(save_dir: Path, count: int) -> bool:
    return all((save_dir / f"CHRDATA{n}.SAV").is_file() for n in range(1, count + 1))


class LedgerProseTests(unittest.TestCase):
    """No external data, no skip guard: these run and can fail on any tree."""

    def test_treasures_states_the_corrected_roster_outcome(self) -> None:
        text = _import_text("treasures-of-the-savage-frontier")
        count, joined = _stated_join_list(text)
        self.assertEqual(count, 6)
        self.assertEqual(joined, ["MAXWELL", "TRISTLE", "MELLIA", "CHERROD", "SPARKLE", "FRAZZLE"])
        self.assertIn("0 rule-rejections", text)
        self.assertIn("exactly 2 rejections by the shared six-hero party cap, OUGO and SMOKE", text)
        self.assertIn("0xD454", text)

    def test_treasures_carries_the_ougo_disagreement_with_its_bytes(self) -> None:
        text = _import_text("treasures-of-the-savage-frontier")
        self.assertIn("OUGO disagrees WITH HERSELF", text)
        self.assertIn("0xae is 0x02 = fighter", text)
        self.assertIn("[8,0,0,0,0,0,0,0]", text)
        self.assertIn("CLERIC, level 8", text)
        self.assertIn("rejectedPartyFullDisagreements", text)

    def test_pools_states_its_roster_and_the_abagail_disagreement(self) -> None:
        text = _import_text("pools-of-darkness")
        self.assertIn("6 of 6 join", text)
        self.assertIn("ABAGAIL disagrees WITH HERSELF", text)
        self.assertIn("[0,0,0,0,0,12,0,11]", text)
        self.assertIn("0xAEAD", text)

    def test_both_entries_say_the_addition_was_an_addition(self) -> None:
        """The round-33 lesson: an addition dressed as a correction hides which of the
        measurement / ledger entry / pin was the missing one."""
        for pid in ("treasures-of-the-savage-frontier", "pools-of-darkness"):
            with self.subTest(pid):
                self.assertIn("ADDITION, NOT A CORRECTION", _import_text(pid).upper())

    def test_the_argued_by_consequence_label_is_preserved(self) -> None:
        """`imul r16, imm8` has zero hits in these 8086-targeted builds, so the 0-based race-byte
        read is an argument from consequence. Both entries must keep the exact label and must not
        upgrade it."""
        for pid in ("treasures-of-the-savage-frontier", "pools-of-darkness"):
            with self.subTest(pid):
                text = _import_text(pid)
                self.assertIn("argued by consequence, indexing instruction not located", text)
                self.assertNotIn("indexing instruction located", text.replace("not located", ""))


class LedgerAgainstRetailBytesTests(unittest.TestCase):
    """Skips when the referenced, never-vendored GOG installs are absent -- see the module doc
    for why the prose arm above deliberately does not."""

    @unittest.skipUnless(_saves_present(TREASURES_SAVE, 8), "Treasures GOG SAVE/ not present")
    def test_treasures_ougo_bytes_are_what_the_ledger_says(self) -> None:
        by_name = _records_by_name(TREASURES_SAVE, 8)
        filename, raw = by_name["OUGO"]
        text = _import_text("treasures-of-the-savage-frontier")
        m = re.search(r"0xae is 0x([0-9a-f]{2}) = (\w+)", text)
        assert m is not None
        self.assertEqual(raw[OFF_CLASS], int(m.group(1), 16))
        self.assertIn(m.group(2), CLASS_CODE[raw[OFF_CLASS]])
        stated = re.search(r"0x151 reads \[([0-9,]+)\]", text)
        assert stated is not None
        self.assertEqual(_class_level(raw), [int(v) for v in stated.group(1).split(",")])
        nonzero = [SLOT_ORDER[i] for i, v in enumerate(_class_level(raw)) if v]
        self.assertEqual(nonzero, ["cleric"])  # the disagreement, from the bytes
        self.assertFalse(_agrees(raw))
        # The ledger names the exact save file this disagreement came from ("In
        # SAVE/CHRDATA7.SAV her class byte..."). Nothing checked that filename before --
        # the verifier flagged it as an editable-with-impunity claim on the Pools side, and
        # this arm shares the same gap, so both get the same check.
        m_file = re.search(r"In SAVE/(CHRDATA\d+\.SAV) her class byte at", text)
        assert m_file is not None, "ledger no longer names OUGO's own save file"
        self.assertEqual(m_file.group(1), filename)

    @unittest.skipUnless(_saves_present(TREASURES_SAVE, 8), "Treasures GOG SAVE/ not present")
    def test_treasures_cherrod_moved_class_byte_and_level_array(self) -> None:
        """The "WHAT MOVED" sentence in gap[0] states CHERROD's class byte and classLevel
        array together (the multi-class that round 35 R4's race-table fix legalized). The
        verifier found this pairing unpinned: only her race byte was checked elsewhere
        (`test_treasures_cherrod_race_byte_and_roster_position`), so the class byte and level
        array quoted in the same bullet could drift from her actual bytes with every existing
        test staying green."""
        text = _import_text("treasures-of-the-savage-frontier")
        m = re.search(r"class byte 0x([0-9a-f]{2}), classLevel\[8\]@0x151 = \[([0-9,]+)\]", text)
        assert m is not None, "ledger no longer states CHERROD's class byte + level array"
        _, raw = _records_by_name(TREASURES_SAVE, 8)["CHERROD"]
        self.assertEqual(raw[OFF_CLASS], int(m.group(1), 16))
        self.assertEqual(_class_level(raw), [int(v) for v in m.group(2).split(",")])
        self.assertTrue(_agrees(raw))  # this is the LEGAL multi-class, not the disagreement

    @unittest.skipUnless(_saves_present(TREASURES_SAVE, 8), "Treasures GOG SAVE/ not present")
    def test_treasures_cherrod_race_byte_and_roster_position(self) -> None:
        records = _records(TREASURES_SAVE, 8)
        by_name = dict(records)
        text = _import_text("treasures-of-the-savage-frontier")
        m = re.search(r"CHERROD's race byte 0x([0-9a-f]{2}) at record offset 0x([0-9a-f]{2})", text)
        assert m is not None
        self.assertEqual(by_name["CHERROD"][int(m.group(2), 16)], int(m.group(1), 16))
        # With the ledger's own "0 rule-rejections", file order plus the six-hero cap fixes the
        # roster: the first six join and the rest are cap rejections. Both halves are checked.
        names = [n for n, _ in records]
        joined, capped = names[:PARTY_CAP], names[PARTY_CAP:]
        stated_count, stated_joined = _stated_join_list(text)
        self.assertEqual(stated_joined, joined)  # the ORDERED list, not membership
        self.assertEqual(stated_count, len(joined))
        self.assertEqual(capped, ["OUGO", "SMOKE"])
        m2 = re.search(r"exactly (\d+) rejections by the shared six-hero party cap", text)
        assert m2 is not None
        self.assertEqual(len(capped), int(m2.group(1)))

    @unittest.skipUnless(_saves_present(TREASURES_SAVE, 8), "Treasures GOG SAVE/ not present")
    def test_treasures_agreement_count_matches_the_ledger(self) -> None:
        text = _import_text("treasures-of-the-savage-frontier")
        m = re.search(r"\((\d+) of (\d+) agree", text)
        assert m is not None
        agreeing = sum(1 for _, raw in _records(TREASURES_SAVE, 8) if _agrees(raw))
        self.assertEqual((agreeing, 8), (int(m.group(1)), int(m.group(2))))

    @unittest.skipUnless(_saves_present(POOLS_SAVE, 6), "Pools GOG SAVE/ not present")
    def test_pools_abagail_bytes_and_agreement_count(self) -> None:
        records = _records(POOLS_SAVE, 6)
        by_name_filename = _records_by_name(POOLS_SAVE, 6)
        filename, raw = by_name_filename["ABAGAIL"]
        text = _import_text("pools-of-darkness")
        stated = re.search(r"0x151 reads \[([0-9,]+)\]", text)
        assert stated is not None
        self.assertEqual(_class_level(raw), [int(v) for v in stated.group(1).split(",")])
        self.assertFalse(_agrees(raw))
        m = re.search(r"\((\d+) of (\d+) agree", text)
        assert m is not None
        agreeing = sum(1 for _, r in records if _agrees(r))
        self.assertEqual((agreeing, 6), (int(m.group(1)), int(m.group(2))))
        self.assertIn("0 party-cap rejections", text)
        # Two claims the verifier found completely unpinned: the class byte itself (the
        # Treasures arm has an "0xae is 0x.. = .." regex check; this Pools arm previously had
        # none at all) and the exact save filename the disagreement is quoted from. The
        # verifier proved both were free to drift -- "0xae is 0x05 = magic_user" -> "0xae is
        # 0x02 = fighter" and "In SAVE/CHRDATA5.SAV" -> "CHRDATA2.SAV" -- with all 9 tests that
        # existed at the time staying green.
        m_class = re.search(r"class byte at (?:record offset )?0xae is 0x([0-9a-f]{2}) = (\w+)", text)
        assert m_class is not None, "ledger no longer states ABAGAIL's class byte"
        self.assertEqual(raw[OFF_CLASS], int(m_class.group(1), 16))
        self.assertIn(m_class.group(2), CLASS_CODE[raw[OFF_CLASS]])
        m_file = re.search(r"In SAVE/(CHRDATA\d+\.SAV) her class byte at", text)
        assert m_file is not None, "ledger no longer names ABAGAIL's own save file"
        self.assertEqual(m_file.group(1), filename)

    @unittest.skipUnless(_saves_present(POOLS_SAVE, 6), "Pools GOG SAVE/ not present")
    def test_pools_binky_moved_class_byte_and_level_array(self) -> None:
        """The Pools twin of `test_treasures_cherrod_moved_class_byte_and_level_array`: gap[0]
        states BINKY's class byte and classLevel array together (the thief level that round
        35 R4's race-table fix took under the dwarf level cap). Previously unpinned."""
        text = _import_text("pools-of-darkness")
        m = re.search(r"class byte 0x([0-9a-f]{2}), classLevel\[8\]@0x151 = \[([0-9,]+)\]", text)
        assert m is not None, "ledger no longer states BINKY's class byte + level array"
        _, raw = _records_by_name(POOLS_SAVE, 6)["BINKY"]
        self.assertEqual(raw[OFF_CLASS], int(m.group(1), 16))
        self.assertEqual(_class_level(raw), [int(v) for v in m.group(2).split(",")])

    @unittest.skipUnless(_saves_present(POOLS_SAVE, 6), "Pools GOG SAVE/ not present")
    def test_pools_party_cap_claim_is_checked_against_the_filesystem(self) -> None:
        """This replaces a tautology. `_records(POOLS_SAVE, 6)` always returns exactly 6
        entries -- its loop is `range(1, count + 1)` with `count` hardcoded to 6 by every
        caller -- so the old `assertLessEqual(len(records), PARTY_CAP)` could not fail under
        any state of the retail data; `records` was an artifact of the call, not a
        measurement. The "0 party-cap rejections" claim actually depends on Pools' retail
        SAVE/ directory holding exactly 6 CHRDATA*.SAV records (not 7 or 8, as Treasures
        does) -- so count them from the filesystem, independent of any hardcoded loop bound.
        """
        actual = sorted(p.name for p in POOLS_SAVE.glob("CHRDATA*.SAV"))
        self.assertEqual(
            len(actual), PARTY_CAP,
            f"expected exactly {PARTY_CAP} CHRDATA*.SAV records in {POOLS_SAVE}, found "
            f"{actual!r} -- if this count ever exceeds {PARTY_CAP}, the ledger's '0 "
            "party-cap rejections' claim for Pools is no longer true and must change",
        )
        self.assertIn("0 party-cap rejections", _import_text("pools-of-darkness"))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
