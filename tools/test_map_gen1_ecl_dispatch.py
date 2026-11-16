"""Tests for `tools/map_gen1_ecl_dispatch.py` (round 32 R4).

Three groups:

1. Synthetic, always-run tests for `read_game_bytes` (the magic/size refusal null) and
   `effective_word_set` (the precedence rule the whole partition depends on) -- no external
   source needed.
2. A synthetic, always-run mutation test for `partition_opcodes`'s "free opcode can still be a
   hidden desync" fix (round 32 R4's own near-miss, documented in the function's own docstring):
   constructs the deliberately-narrower PRE-fix version inline, shows it goes RED (misses the
   desync `partition_opcodes` itself catches), and pins the fixed function's own correct output.
3. Real-bytes integration tests (skipped, not failed, when the GOG Galaxy installs are absent)
   that pin the numbers this round actually measured on Pools/Gateway/Treasures's own real
   `GAME.OVR` bytes against the CoAB oracle -- same convention as
   `tools/test_map_matrix_ecl_dispatch.py`.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import map_gen1_ecl_dispatch as subject  # noqa: E402

try:
    GATEWAY_GAME_OVR, _ = subject.retail_files("gateway")
    TREASURES_GAME_OVR, _ = subject.retail_files("treasures")
    POOLS_GAME_OVR, COAB_GAME_OVR = subject.retail_files("pools")
    HAVE_ALL_THREE = True
except FileNotFoundError:
    HAVE_ALL_THREE = False

try:
    DOK_GAME_OVR, _ = subject.retail_files("dok")
    HAVE_DOK = True
except FileNotFoundError:
    HAVE_DOK = False


class ReadGameBytesTests(unittest.TestCase):
    """The magic/size-refusal null: this tool is calibrated per-title. Synthetic bytes, always
    runs (no external source needed)."""

    def _write(self, payload: bytes) -> Path:
        with tempfile.NamedTemporaryFile(suffix=".OVR", delete=False) as f:
            f.write(payload)
        return Path(f.name)

    def test_accepts_correct_magic_and_size(self) -> None:
        path = self._write(b"FBOV" + b"\x00" * (264086 - 4))
        try:
            data = subject.read_game_bytes("pools", path)
            self.assertEqual(data[:4], b"FBOV")
            self.assertEqual(len(data), 264086)
        finally:
            path.unlink()

    def test_refuses_wrong_magic_same_size(self) -> None:
        # Buck's/Secret's own TPOV, sized to Pools's own expected byte count.
        path = self._write(b"TPOV" + b"\x00" * (264086 - 4))
        try:
            with self.assertRaises(ValueError) as ctx:
                subject.read_game_bytes("pools", path)
            self.assertIn("FBOV", str(ctx.exception))
            self.assertIn("TPOV", str(ctx.exception))
        finally:
            path.unlink()

    def test_refuses_right_magic_wrong_size(self) -> None:
        # Another FBOV title's GAME.OVR (e.g. pointing --game pools at Gateway's own file) has the
        # right magic but the wrong size -- must still be refused, not silently mapped.
        path = self._write(b"FBOV" + b"\x00" * (347622 - 4))
        try:
            with self.assertRaises(ValueError) as ctx:
                subject.read_game_bytes("pools", path)
            self.assertIn("264086", str(ctx.exception))
            self.assertIn("347622", str(ctx.exception))
        finally:
            path.unlink()

    def test_refuses_wrong_magic_and_size_together_for_every_profile(self) -> None:
        for game in ("pools", "gateway", "treasures", "secret"):
            path = self._write(b"\x00\x01\x02\x03" + b"\x00" * 60)
            try:
                with self.assertRaises(ValueError):
                    subject.read_game_bytes(game, path)
            finally:
                path.unlink()


class EffectiveWordSetTests(unittest.TestCase):
    """The precedence rule `partition_opcodes` depends on: opcodeOverrides > wordSetOverrides >
    base KRYNN_GEN1_OPCODES, with the opcode-0x31 SHORT_MENU special case gated by
    `has_short_menu`. Synthetic, always runs."""

    def test_opcode_override_wins_over_word_set_override(self) -> None:
        dialect = {"word_set_overrides": {0x42: 1}, "opcode_overrides": {0x42: 4}}
        self.assertEqual(subject.effective_word_set(0x42, dialect), 4)

    def test_word_set_override_wins_over_base_table(self) -> None:
        # 0x1D is 1 in the shared base table (LONG_WORD_SETS); Gateway's own override sets it to 0.
        self.assertEqual(subject.LONG_WORD_SETS[0x1D], 1)
        dialect = {"word_set_overrides": {0x1D: 0}, "opcode_overrides": {}}
        self.assertEqual(subject.effective_word_set(0x1D, dialect), 0)

    def test_falls_through_to_base_table_when_nothing_overrides(self) -> None:
        dialect = {"word_set_overrides": {}, "opcode_overrides": {}}
        self.assertEqual(subject.effective_word_set(0x1D, dialect), subject.LONG_WORD_SETS[0x1D])

    def test_none_for_an_extension_opcode_with_no_opinion_anywhere(self) -> None:
        dialect = {"word_set_overrides": {}, "opcode_overrides": {}}
        self.assertIsNone(subject.effective_word_set(0x4A, dialect))

    def test_short_menu_gate(self) -> None:
        # Gateway's own literal carries NO opcodeOverrides table at all (has_short_menu=False), so
        # its effective 0x31 falls through to the base table's own SPRITE_OFF (wordSet 0), not the
        # SHORT_MENU wordSet (2) every OTHER Gen1-short dialect inherits.
        gateway_like = {"word_set_overrides": {}, "opcode_overrides": {}, "has_short_menu": False}
        pools_like = {"word_set_overrides": {}, "opcode_overrides": {}, "has_short_menu": True}
        self.assertEqual(
            subject.effective_word_set(subject.SHORT_MENU_OPCODE, gateway_like),
            subject.LONG_WORD_SETS.get(subject.SHORT_MENU_OPCODE),
        )
        self.assertEqual(
            subject.effective_word_set(subject.SHORT_MENU_OPCODE, pools_like),
            subject.SHORT_MENU_WORD_SET,
        )


def _partition_opcodes_pre_r4_buggy(
    measured: dict[int, int | None], current_dialect: dict) -> list[dict]:
    """The PRE-round-32-R4 shape of `partition_opcodes`, reconstructed here only so the mutation
    test below can show it going RED against the exact scenario the fix targets: `desync` set
    ONLY inside the `discriminating` branch, so a `free` opcode where the binary contradicts BOTH
    hypotheses (a hidden third value) is silently reported as `desync: False`."""
    rows: list[dict] = []
    for opcode in range(0x00, 0x50):
        dialect_val = subject.effective_word_set(opcode, current_dialect)
        alt_val = subject.effective_word_set(opcode, subject.PLAIN_SHORT_DIALECT)
        measured_val = measured.get(opcode)
        if measured_val is None:
            partition = "vacuous"
        elif dialect_val == alt_val:
            partition = "free"
        else:
            partition = "discriminating"
        desync = False
        if partition == "discriminating":
            desync = measured_val != dialect_val
        rows.append({"opcode": opcode, "partition": partition, "desync": desync})
    return rows


class PartitionOpcodesHiddenDesyncMutationTest(unittest.TestCase):
    """Round 32 R4's own near-miss (see `partition_opcodes`'s docstring in the tool): a `free`
    opcode (shipped dialect and the plain alternative AGREE with each other, both inheriting the
    same unmodified base value) can still be a desync if the binary measures a THIRD value neither
    hypothesis predicted. This is exactly Treasures' real 0x37: base table says 3, the shipped
    dialect and the plain alternative both leave it unmodified (so partition == "free"), but the
    handler's own prefetch measures 2."""

    def setUp(self) -> None:
        # A minimal dialect that does NOT override 0x37 (so both current and plain-alternative
        # read the shared base value of 3, partition == "free"), with the binary measuring 2.
        self.dialect = {"word_set_overrides": {}, "opcode_overrides": {}, "has_short_menu": False}
        self.measured = {0x37: 2}

    def test_the_scenario_really_is_free_under_both_hypotheses(self) -> None:
        current = subject.effective_word_set(0x37, self.dialect)
        alt = subject.effective_word_set(0x37, subject.PLAIN_SHORT_DIALECT)
        self.assertEqual(current, alt)  # both 3 -- precondition for "free"

    def test_red_the_pre_fix_version_misses_the_hidden_desync(self) -> None:
        # RED (quoted): the pre-fix reconstruction reports desync=False for 0x37 even though the
        # binary (2) contradicts the dialect's inherited 3.
        rows = _partition_opcodes_pre_r4_buggy(self.measured, self.dialect)
        row_37 = next(r for r in rows if r["opcode"] == 0x37)
        self.assertEqual(row_37["partition"], "free")
        self.assertFalse(
            row_37["desync"],
            "RED (expected, documents the bug): pre-fix partition_opcodes reports "
            "desync=False for a 'free' opcode even when the binary contradicts it -- "
            f"row={row_37!r}",
        )

    def test_green_the_shipped_version_catches_it(self) -> None:
        # GREEN: the shipped `partition_opcodes` (restored/current code) catches the same case.
        rows = subject.partition_opcodes(self.measured, self.dialect)
        row_37 = next(r for r in rows if r["opcode"] == 0x37)
        self.assertEqual(row_37["partition"], "free")
        self.assertTrue(row_37["desync"], f"shipped partition_opcodes should flag this: {row_37!r}")


# --- Round 35 R1: the second operand reader, and its null -------------------------------------
#
# 16-bit real-mode handler bodies, hand-assembled, so this class runs with no external source.
#   `55 89 e5`             push bp; mov bp,sp        (the Borland prologue every handler opens with)
#   `ff 06 34 12`          inc word ptr [0x1234]     (the PC step a zero-operand handler makes)
#   `b0 NN 50 9a 2a 00 41 00`  mov al,NN; push ax; lcall 0x41,0x2a   (the operand prefetch)
#   `5d cb`                pop bp; retf
_H_PROLOGUE = bytes.fromhex("5589e5")
_H_INC_PC = bytes.fromhex("ff063412")
_H_EPILOGUE = bytes.fromhex("5dcb")
_H_CALL_TARGET = "0x41, 0x2a"


def _h_prefetch(count: int) -> bytes:
    return bytes([0xB0, count, 0x50]) + bytes.fromhex("9a2a004100")


_HANDLER_ZERO_OPERAND = _H_PROLOGUE + _H_INC_PC + _H_EPILOGUE
_HANDLER_ONE_OPERAND = _H_PROLOGUE + _h_prefetch(1) + _H_EPILOGUE
# The contradiction the null exists to catch: declares 3 operands AND hand-steps the PC.
_HANDLER_CONTRADICTORY = _H_PROLOGUE + _h_prefetch(3) + _H_INC_PC + _H_EPILOGUE


def _synthetic_overlay(bodies: dict[int, bytes]) -> tuple[bytes, list[dict[str, int]]]:
    blob = b""
    rows: list[dict[str, int]] = []
    for opcode, body in bodies.items():
        rows.append({"opcode": opcode, "handler_file_offset": len(blob)})
        blob += body
    return blob, rows


class ZeroOperandByPcAdvanceTests(unittest.TestCase):
    """`zero_operand_by_pc_advance` is the SECOND operand-count reader round 35 R1 added, for the
    handlers that never call the operand parser and which the `mov al,N` prefetch reader therefore
    leaves at `None`. Synthetic bytes, always runs.

    The point of this class is the NULL, not the happy path: the idiom is only a zero-operand
    signal if no handler that demonstrably DOES consume operands also carries `inc [PC]`. The
    mutation below constructs exactly such a handler and shows the null fires."""

    def test_derives_the_pc_cell_and_reads_the_zero_operand_handlers(self) -> None:
        blob, rows = _synthetic_overlay(
            {
                0x01: _HANDLER_ZERO_OPERAND,
                0x02: _HANDLER_ZERO_OPERAND,
                0x03: _HANDLER_ZERO_OPERAND,
                0x10: _HANDLER_ONE_OPERAND,
            }
        )
        result = subject.zero_operand_by_pc_advance(blob, rows, _H_CALL_TARGET)
        # The cell is DERIVED from the bytes, never passed in.
        self.assertEqual(result["pc_cell_hex"], "0x1234")
        self.assertTrue(result["pc_inc_unanimous"])
        self.assertEqual(result["pc_inc_candidates"], {"0x1234": 3})
        self.assertEqual(result["zero_operand_opcodes"], [0x01, 0x02, 0x03])
        self.assertEqual(result["prefetch_measured_count"], 1)
        self.assertEqual(result["false_positive_opcodes"], [])

    def test_mutation_a_contradictory_handler_makes_the_null_fire(self) -> None:
        # RED for the idiom (deliberately): opcode 0x11 declares a 3-operand prefetch AND `inc`s the
        # same cell. Those two facts cannot both describe a zero-operand handler, so the reader must
        # surface it in `false_positive_opcodes` -- which is `build_report`'s cue to discard the
        # whole result rather than merge any of it. Without this test the "0 false positives out of
        # 47" measured on the real DoK/Pools/Gateway/Treasures overlays would be unfalsifiable.
        clean_blob, clean_rows = _synthetic_overlay(
            {0x01: _HANDLER_ZERO_OPERAND, 0x02: _HANDLER_ZERO_OPERAND, 0x03: _HANDLER_ZERO_OPERAND}
        )
        self.assertEqual(
            subject.zero_operand_by_pc_advance(clean_blob, clean_rows, _H_CALL_TARGET)[
                "false_positive_opcodes"
            ],
            [],
        )
        blob, rows = _synthetic_overlay(
            {
                0x01: _HANDLER_ZERO_OPERAND,
                0x02: _HANDLER_ZERO_OPERAND,
                0x03: _HANDLER_ZERO_OPERAND,
                0x11: _HANDLER_CONTRADICTORY,
            }
        )
        result = subject.zero_operand_by_pc_advance(blob, rows, _H_CALL_TARGET)
        self.assertEqual(result["false_positive_opcodes"], [0x11])

    def test_refuses_rather_than_guesses_when_nothing_incs(self) -> None:
        blob, rows = _synthetic_overlay({0x10: _HANDLER_ONE_OPERAND})
        result = subject.zero_operand_by_pc_advance(blob, rows, _H_CALL_TARGET)
        self.assertIsNone(result["pc_cell"])
        self.assertEqual(result["zero_operand_opcodes"], [])
        self.assertIsNotNone(result["reason"])


# The 54 `handler_file_offset` values in `build/dok-ecl-dispatch-map.json`, produced 2026-07-17 by
# the SEPARATE, older `tools/map_dok_ecl_dispatch.py`. Inlined because `build/` is git-ignored, so
# a skip-if-absent control would be a control that can pass without running. This is the tooling
# control for routing DoK through `map_gen1_ecl_dispatch`: the structural CoAB-oracle match must
# reproduce every one of these, or it located the wrong function.
DOK_V1_HANDLER_OFFSETS: dict[int, int] = {
    0x00: 0x081D, 0x01: 0x08B8, 0x02: 0x08D5, 0x03: 0x08EA, 0x07: 0x0967, 0x08: 0x0A18,
    0x09: 0x0A7A, 0x0A: 0x0ACC, 0x0B: 0x0C8F, 0x0C: 0x0BAC, 0x0D: 0x1133, 0x0E: 0x1189,
    0x0F: 0x1258, 0x10: 0x12A2, 0x12: 0x131A, 0x13: 0x13B6, 0x14: 0x140A, 0x15: 0x1885,
    0x1B: 0x14F9, 0x1C: 0x1B93, 0x1D: 0x237C, 0x1E: 0x1C6F, 0x1F: 0x2FBC, 0x20: 0x156F,
    0x22: 0x23BB, 0x23: 0x3076, 0x24: 0x1F09, 0x26: 0x20BB, 0x27: 0x2150, 0x28: 0x2293,
    0x29: 0x30E6, 0x2A: 0x17CF, 0x2B: 0x1A1A, 0x2C: 0x3095, 0x2D: 0x2AB1, 0x2E: 0x24BF,
    0x30: 0x175C, 0x31: 0x1A1A, 0x32: 0x23FA, 0x33: 0x284A, 0x34: 0x2815, 0x35: 0x1835,
    0x36: 0x292C, 0x37: 0x15C7, 0x38: 0x2BFA, 0x39: 0x28C6, 0x3A: 0x24AD, 0x3B: 0x2994,
    0x3C: 0x30EF, 0x3D: 0x2873, 0x3E: 0x2CA4, 0x3F: 0x2CD3, 0x40: 0x2D27, 0x41: 0x2E0E,
}


@unittest.skipUnless(HAVE_DOK, "needs the GOG Galaxy Death Knights of Krynn + CoAB installs")
class DokRealBytesTests(unittest.TestCase):
    """Round 35 R1: Death Knights of Krynn's own operand-count evidence, measured on its own
    `GAME.OVR`. Until this round DoK was the only Gen1 title whose ECL word sets came entirely
    from inheriting the shared `ECL_GEN1_SHORT` literal -- its 2026-07-17 dispatch map stopped at
    handler offsets and never read a prologue."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.report = subject.build_report("dok")
        cls.data = subject.read_game_bytes("dok", DOK_GAME_OVR)

    def test_opens_with_dok_own_fbov_magic_at_its_own_size(self) -> None:
        self.assertEqual(self.report["magic"], "FBOV")
        self.assertEqual(self.report["file_size"], 252469)

    def test_reproduces_every_v1_handler_offset_and_finds_twelve_more(self) -> None:
        # THE TOOLING CONTROL. 54/54, 0 disagreements -- an independent 2026-07-17 tool and this
        # round's structural match agree byte-for-byte on where every handler lives.
        found = {row["opcode"]: row["handler_file_offset"] for row in self.report["dispatch"]}
        disagreements = {
            opcode: (expected, found.get(opcode))
            for opcode, expected in DOK_V1_HANDLER_OFFSETS.items()
            if found.get(opcode) != expected
        }
        self.assertEqual(disagreements, {})
        self.assertEqual(len(DOK_V1_HANDLER_OFFSETS), 54)
        # ...and 12 opcodes v1's linear-only reader missed, recovered by the fallthrough-merge
        # resolver. So DoK dispatches 0x00..0x41 with NO gap, not 54 entries with 12 holes.
        self.assertEqual(
            sorted(set(found) - set(DOK_V1_HANDLER_OFFSETS)),
            [0x04, 0x05, 0x06, 0x11, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x21, 0x25, 0x2F],
        )
        self.assertEqual(self.report["handler_count"], 66)
        self.assertEqual((self.report["opcode_min"], self.report["opcode_max"]), (0x00, 0x41))

    def test_every_located_handler_opens_with_the_borland_prologue(self) -> None:
        # Prediction (PLAN-ROUND-35 R1): prologue coverage >= 40 of 54. Measured: 54/54 on the v1
        # set and 66/66 across every handler this round located, including all 12 new ones -- so
        # the fallthrough-merge resolver is not manufacturing offsets that land mid-function.
        prologue = bytes.fromhex("5589e5")
        v1_hits = sum(1 for off in DOK_V1_HANDLER_OFFSETS.values() if self.data[off:off + 3] == prologue)
        self.assertEqual(v1_hits, 54)
        all_hits = sum(
            1
            for row in self.report["dispatch"]
            if self.data[row["handler_file_offset"]:row["handler_file_offset"] + 3] == prologue
        )
        self.assertEqual(all_hits, 66)

    def test_dispatcher_and_parser_beat_their_own_nulls(self) -> None:
        # Prediction (PLAN-ROUND-35 R1): dispatcher similarity >= 0.97 with the same-length null
        # reported. Measured: 0.9763 dispatcher (runner-up 0.2641, same-length 0.1388) and 1.0000
        # parser (runner-up 0.4796, same-length 0.4304).
        dispatcher = self.report["matches"]["dispatcher"]
        parser = self.report["matches"]["operand_parser"]
        self.assertEqual(dispatcher["game"]["offset"], 0x3271)
        self.assertEqual(parser["game"]["offset"], 0x6BA8)
        self.assertGreaterEqual(dispatcher["sequence_similarity"], 0.97)
        self.assertAlmostEqual(dispatcher["sequence_similarity"], 0.9763, places=3)
        self.assertAlmostEqual(parser["sequence_similarity"], 1.0000, places=3)
        self.assertLess(dispatcher["runner_up_similarity_null"], dispatcher["sequence_similarity"] - 0.4)
        self.assertLess(dispatcher["same_length_similarity_null"], 0.20)
        self.assertEqual(self.report["operand_parser_call_target"]["target"], "0x41, 0x2a")
        self.assertEqual(self.report["operand_parser_call_target"]["handlers_using_it_first"], 45)

    def test_the_pc_idiom_is_derived_unanimous_cross_checked_and_has_a_clean_null(self) -> None:
        idiom = self.report["zero_operand_by_pc_advance"]
        # Derived, not passed in -- and there is no competing address at all.
        self.assertEqual(idiom["pc_cell_hex"], "0x8c48")
        self.assertEqual(idiom["pc_inc_candidates"], {"0x8c48": 18})
        self.assertTrue(idiom["pc_inc_unanimous"])
        # Independent cross-check: the SAME cell is `dec`'d by exactly the count-driven opcodes,
        # immediately before their second, register-argument prefetch.
        self.assertEqual(idiom["pc_dec_opcodes"], [0x15, 0x25, 0x26, 0x27, 0x2B, 0x31])
        # THE NULL: 0 of the 47 prefetch-measured handlers with N >= 1 also carries `inc [PC]`.
        self.assertEqual(idiom["false_positive_opcodes"], [])
        self.assertEqual(idiom["prefetch_measured_count"], 47)
        self.assertEqual(len(idiom["applied_opcodes"]), 18)
        # 47 by prefetch + 18 by the idiom = 65 of 66; only 0x23 is left, and it is read by hand
        # (it tail-calls opcode 0x00's handler, so it fetches nothing).
        unmeasured = sorted(int(k) for k, v in self.report["word_sets"].items() if v is None)
        self.assertEqual(unmeasured, [0x23])

    def test_three_disagreements_with_the_shared_short_dialect_each_from_a_handler_byte(self) -> None:
        # RE-PINNED 2026-09-10, and the MOVEMENT is the finding -- read it before re-pinning again.
        # The three opcodes have not changed and neither have their handler bytes; what changed is
        # which BUCKET they land in, and that is a statement about the mirror, not about DoK.
        #
        # This test used to open: "DoK's `CURRENT_DIALECTS` entry IS the plain shared literal, so
        # `discriminating` is 0 by construction and every real finding lands in `free` with
        # `desync` set." That was true when written and is now false. `ECL_GEN1_SHORT_DOK` -- a
        # DoK-specific TypeScript dialect carrying exactly these three frames -- had existed in
        # `packages/engine/src/ecl/disassemble.ts` for days while `CURRENT_DIALECTS["dok"]` still
        # said `dict(SHORT_OVERRIDES)`, so this module was comparing DoK's binary against a dialect
        # the engine had already replaced. Resyncing the mirror moves all three buckets:
        #
        #   desync          = dialect and the plain-short alternative AGREE, and the binary
        #                     contradicts both. It is the "nobody noticed" bucket.
        #   discriminating  = dialect and the alternative DISAGREE, so the binary can choose --
        #                     and here it chooses the dialect, 3 for 3.
        #
        # The same three handler bytes therefore now say something strictly STRONGER than they did:
        # not "the engine is wrong about DoK" but "the engine's DoK-specific dialect is right and
        # the shared literal it was split off from is wrong". `free` drops 65 -> 62 for the same
        # reason -- those three rows left it, nothing else moved.
        self.assertEqual(
            self.report["partition_totals"],
            {"discriminating": 3, "free": 62, "vacuous": 15, "desync": 0},
        )
        desync = {
            row["opcode"]: (row["current_dialect_word_set"], row["measured_word_set"])
            for row in self.report["partition"]
            if row["partition"] == "discriminating"
        }
        # 0x1f @0x2fbc `mov al,1`; 0x27 @0x2150 `mov al,4` (+ a second, count-driven prefetch);
        # 0x29 @0x30e6 is `push bp; mov bp,sp; inc word ptr [0x8c48]; pop bp; retf` -- five
        # instructions, no call of any kind, so nothing in it can consume a script byte.
        # The dialect column now carries DoK's OWN measured value, which is the point of the
        # resync: before it, this dict read `{0x1F: (2, 1), 0x27: (8, 4), 0x29: (14, 0)}`, where
        # every left-hand number was the stale shared-literal frame rather than DoK's.
        self.assertEqual(desync, {0x1F: (1, 1), 0x27: (4, 4), 0x29: (0, 0)})
        # And each really is a CHOICE against a different alternative, not a self-agreement: the
        # plain shared literal still carries the value DoK's own bytes refute. Without this the
        # dict above would be satisfiable by a mirror that had simply been overwritten with the
        # measurements.
        plain = {
            row["opcode"]: row["plain_short_word_set"]
            for row in self.report["partition"]
            if row["partition"] == "discriminating"
        }
        self.assertEqual(plain, {0x1F: 2, 0x27: 8, 0x29: 14})
        self.assertEqual([r["opcode"] for r in self.report["partition"] if r["desync"]], [])
        # The whole 0x29 body, all nine bytes of it.
        self.assertEqual(self.data[0x30E6:0x30EF], bytes.fromhex("5589e5ff06488c5dcb"))
        # The prefetch idiom itself -- `mov al,N; push ax; lcall 0x41,0x2a`. It does NOT sit
        # immediately after the prologue: Borland emits the local-frame `sub sp,imm` in between
        # (0x2fbf `sub sp,0x304` for 0x1f, 0x2153 `sub sp,0x48` for 0x27), so these offsets are the
        # measured prefetch sites, not prologue+3.
        self.assertEqual(self.data[0x2FC3:0x2FCB], bytes.fromhex("b001509a2a004100"))
        self.assertEqual(self.data[0x2156:0x215E], bytes.fromhex("b004509a2a004100"))

    def test_0x41_is_inherited_not_overridden_and_dok_is_an_eighth_agreeing_binary(self) -> None:
        # Round 34 put `0x41: {wordSet: 2}` in the shared base table. DoK measures 2 from its own
        # `mov al,2` at 0x2e0e, so an override here would be a free-agreement claim -- and 0x41
        # must therefore NOT appear among the desyncs above.
        self.assertEqual(self.report["word_sets"]["65"], 2)
        self.assertEqual(self.data[0x2E15:0x2E1D], bytes.fromhex("b002509a2a004100"))
        self.assertNotIn(0x41, [row["opcode"] for row in self.report["partition"] if row["desync"]])


@unittest.skipUnless(
    HAVE_ALL_THREE, "needs the GOG Galaxy Pools/Gateway/Treasures/CoAB installs (external, never-vendored)"
)
class RealBytesIntegrationTests(unittest.TestCase):
    """Pins the numbers round 32 R4 actually measured against each title's real GAME.OVR."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.reports = {game: subject.build_report(game) for game in ("pools", "gateway", "treasures")}

    def test_all_three_open_with_their_own_fbov_magic(self) -> None:
        for game, report in self.reports.items():
            self.assertEqual(report["magic"], "FBOV", game)

    def test_dispatcher_and_parser_offsets(self) -> None:
        expected = {
            "pools": (0x28CB, 0x65EB),
            "gateway": (0x43F3, 0x9471),
            "treasures": (0x319E, 0x7354),
        }
        for game, (dispatcher_off, parser_off) in expected.items():
            report = self.reports[game]
            self.assertEqual(report["matches"]["dispatcher"]["game"]["offset"], dispatcher_off, game)
            self.assertEqual(report["matches"]["operand_parser"]["game"]["offset"], parser_off, game)

    def test_similarity_clears_the_plans_0_95_pools_floor_and_decisively_beats_its_own_nulls(self) -> None:
        # Prediction (docs/engine/PLAN-ROUND-32.md R4): Pools similarity >= 0.95. Measured: 0.9680
        # dispatcher / 1.0000 parser -- both above the floor, and each several times its own
        # runner-up null (0.2948 / 0.4796) and same-length null (0.1497 / 0.4268).
        pools = self.reports["pools"]
        self.assertGreaterEqual(pools["matches"]["dispatcher"]["sequence_similarity"], 0.95)
        self.assertAlmostEqual(pools["matches"]["dispatcher"]["sequence_similarity"], 0.9680, places=3)
        self.assertAlmostEqual(pools["matches"]["operand_parser"]["sequence_similarity"], 1.0000, places=3)
        self.assertLess(pools["matches"]["dispatcher"]["runner_up_similarity_null"], 0.35)
        self.assertLess(pools["matches"]["dispatcher"]["same_length_similarity_null"], 0.20)

        gateway = self.reports["gateway"]
        self.assertAlmostEqual(gateway["matches"]["dispatcher"]["sequence_similarity"], 0.9880, places=3)
        self.assertAlmostEqual(gateway["matches"]["operand_parser"]["sequence_similarity"], 0.9917, places=3)

        treasures = self.reports["treasures"]
        self.assertAlmostEqual(treasures["matches"]["dispatcher"]["sequence_similarity"], 0.9410, places=3)
        self.assertAlmostEqual(treasures["matches"]["operand_parser"]["sequence_similarity"], 0.9917, places=3)

    def test_pools_dispatches_at_least_40_opcodes(self) -> None:
        # Prediction: Pools dispatches >= 40 opcodes. Measured: handler_count below.
        self.assertGreaterEqual(self.reports["pools"]["handler_count"], 40)

    def test_pools_docblock_verdict_confirms_all_four_handlers_the_ledger_sentence_denies(self) -> None:
        verdict = self.reports["pools"]["pools_docblock_verdict"]
        self.assertEqual(set(verdict.keys()), {"0x1f", "0x21", "0x37", "0x41"})
        for opcode, row in verdict.items():
            self.assertTrue(row["holds_prefetch_idiom_at_docblock_offset"], opcode)
            self.assertTrue(row["matches_claimed_n"], opcode)

    def test_treasures_0x42_is_4_from_its_own_handler(self) -> None:
        treasures = self.reports["treasures"]
        row = next(r for r in treasures["dispatch"] if r["opcode"] == 0x42)
        self.assertEqual(treasures["word_sets"][str(row["opcode"])], 4)

    def test_prediction_the_corpus_fit_got_at_least_one_opcode_wrong_and_it_was_never_the_discriminating_ones(self) -> None:
        # Prediction (docs/engine/PLAN-ROUND-32.md R4): "at least one discriminating opcode the
        # corpus fit got wrong". Measured: EVERY one of the 4 (Pools) / 2 (Gateway) / 2
        # (Treasures) `discriminating` opcodes actually agrees with the then-current dialect --
        # the corpus-agreement fit got those right. All 13 real desyncs (1 Pools, 6 Gateway, 6
        # Treasures) instead land in the `free` partition (dialect and the plain alternative
        # AGREE with each other, both inheriting an unmodified base value the binary contradicts)
        # -- the exact hidden-desync shape `partition_opcodes`'s own broadened `desync` flag
        # exists to catch (see `PartitionOpcodesHiddenDesyncMutationTest` above). So the
        # prediction's literal wording (about the `discriminating` bucket) is falsified, but its
        # spirit -- the corpus fit got real opcodes wrong -- holds, just in the bucket the
        # pre-fix code could not see.
        for game in ("pools", "gateway", "treasures"):
            rows = self.reports[game]["partition"]
            wrong_discriminating = [
                r for r in rows if r["partition"] == "discriminating" and r["agrees_with_dialect"] is False
            ]
            self.assertEqual(wrong_discriminating, [], game)
        # ROUND 35 R1 (2026-09-05) -- this tuple moved from {"pools": 1, "gateway": 6,
        # "treasures": 6}. It is NOT re-pinned to whatever the new code printed; each of the three
        # movements was adjudicated by disassembling the handler that moved, and the desync OPCODE
        # SETS below (not just the totals) are pinned so a future silent shuffle cannot hide inside
        # an unchanged count -- which is exactly what Treasures' 6 -> 6 does here.
        #
        #   * gateway 6 -> 5, treasures loses 0x41: `BASE_TABLE_EXTENSIONS = {0x41: 2}`. Round 34
        #     shipped `0x41: {wordSet: 2}` into the TypeScript base table `KRYNN_GEN1_OPCODES`, but
        #     this module reads its base values through `map_buck_ecl_dispatch.LONG_WORD_SETS`, a
        #     hand-maintained Python MIRROR of that table which nobody updated. Both binaries
        #     measure 0x41 = 2 from their own `mov al,2` prefetch, so the "desync" was against a
        #     stale mirror, never against the engine. Supplementing the mirror removes it.
        #   * pools 1 -> 2 and treasures gains 0x29: a genuinely NEW finding, from the second
        #     operand reader this round added (`zero_operand_by_pc_advance`). Both titles inherit
        #     0x29 = 14 from the base table; both handlers consume zero script bytes, read from the
        #     bytes: Pools 0x29 @0x275c is five instructions,
        #     `push bp; mov bp,sp; inc word ptr [0x880a]; pop bp; retf`, with no call of any kind;
        #     Treasures 0x29 @0x2fb6 is `push bp; mov bp,sp; xor ax,ax; lcall 0xa77,0x4df;
        #     inc word ptr [0x7e22]; pop bp; retf` -- its one far call is NOT the operand parser
        #     (Treasures parser target is `0x58, 0x2a`) and carries no `mov al,N`, and the
        #     trailing `inc [PC]` is the zero-operand handler stepping past its own opcode byte.
        #     DoK own 0x29 @0x30e6 has the identical shape. This is a defect in THREE dialects
        #     round 35 R1 does not own (`ECL_GEN1_SHORT` is shared) and is reported, not fixed.
        # ROUND 38 (2026-09-10) -- this tuple moved AGAIN, from {"pools": 2, "gateway": 5,
        # "treasures": 6} to {"pools": 1, "gateway": 0, "treasures": 1}, and it is NOT re-pinned to
        # whatever the new code printed either. TWELVE of the thirteen desyncs turned out to be the
        # same defect the round-35 note above already isolated for a single opcode (0x41), and the
        # generalisation is the finding: `CURRENT_DIALECTS` is a hand-kept Python MIRROR of
        # `packages/engine/src/ecl/disassemble.ts`, and it had drifted on fourteen rows at once.
        # Adjudicated per movement:
        #
        #   * gateway 5 -> 0, all five. Gateway's TypeScript dialect was corrected to the LONG
        #     frames on 2026-09-03; this mirror kept the retracted short-form guesses that
        #     correction replaced. All five rows were the mirror disagreeing with the engine, and
        #     the binary siding with the engine.
        #   * treasures loses 0x1F, 0x27, 0x37, 0x43, 0x44 (six -> one), and pools loses 0x27:
        #     same shape -- the mirror lacked overrides `ECL_GEN1_SHORT_TREASURES` /
        #     `ECL_GEN1_SHORT_POOLS` already carried.
        #
        # In every one of the twelve the "desync" was AGAINST A STALE MIRROR ROW, never against the
        # engine and never against a binary; no byte of any `GAME.OVR` and no engine value changed,
        # and none of the twelve is a finding about a Gold Box title at all.
        #
        # THE GENERAL LESSON, because this pin has now moved for exactly this reason in two
        # consecutive rounds: a "desync" this tool reports is a claim about a COMPARISON, and a
        # comparison has two sides. Before reading one as a defect in the engine or in the retail
        # bytes, check that the mirror row being compared is the row the engine actually ships.
        # `tools/test_ecl_dialect_parity.py` now checks that mechanically on every `test:corpus`
        # run against the TypeScript source itself, so this should be the last round in which the
        # check is a matter of somebody remembering to do it.
        #
        # WHAT SURVIVES IS THE REAL FINDING, and it is precisely the one round 35 R1 flagged as a
        # defect it did not own: Pools 0x29 and Treasures 0x29 still inherit `0x29 = 14` from the
        # shared `ECL_GEN1_SHORT`, and both binaries measure 0 by PC advance. DoK's own 0x29 left
        # this list only because DoK got a dialect of its own; Pools and Treasures still have no
        # override for this opcode on either side. Two titles, still open, still unfixed here.
        totals = {game: self.reports[game]["partition_totals"]["desync"] for game in self.reports}
        self.assertEqual(totals, {"pools": 1, "gateway": 0, "treasures": 1})
        desync_opcodes = {
            game: sorted(r["opcode"] for r in self.reports[game]["partition"] if r["desync"])
            for game in self.reports
        }
        self.assertEqual(
            desync_opcodes,
            {"pools": [0x29], "gateway": [], "treasures": [0x29]},
        )
        # Pin the SHAPE of the two survivors, not just their opcode numbers: both must still be the
        # hidden kind (dialect and plain alternative agreeing on 14 while the binary says 0). A
        # future edit that "fixes" them by changing only one side would keep the sets above intact.
        for game in ("pools", "treasures"):
            row = next(r for r in self.reports[game]["partition"] if r["opcode"] == 0x29)
            self.assertEqual(
                (row["current_dialect_word_set"], row["plain_short_word_set"], row["measured_word_set"]),
                (14, 14, 0),
                game,
            )
        for game in ("pools", "gateway", "treasures"):
            desync_rows = [r for r in self.reports[game]["partition"] if r["desync"]]
            self.assertTrue(all(r["partition"] == "free" for r in desync_rows), game)

    def test_mutation_a_shifted_dispatcher_offset_scores_far_below_the_real_winner(self) -> None:
        # The real form of the "wrong candidate" null (matching test_map_matrix_ecl_dispatch.py's
        # own convention): the located dispatcher's nearest rival among every OTHER
        # Borland-prologue-shaped candidate in the same file scores decisively lower than the
        # winner -- confirming the match isn't "we just found A function of similar shape",
        # it's THE dispatcher.
        for game in ("pools", "gateway", "treasures"):
            report = self.reports[game]
            winner_sim = report["matches"]["dispatcher"]["sequence_similarity"]
            null_sim = report["matches"]["dispatcher"]["runner_up_similarity_null"]
            self.assertIsNotNone(null_sim, game)
            self.assertLess(null_sim, winner_sim - 0.4, game)


if __name__ == "__main__":
    unittest.main()
