from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import map_buck_ecl_dispatch as subject  # noqa: E402

REPO_ROOT = TOOLS.parent
BUCK_INSTALL = Path("D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday")
COAB_INSTALL = Path("C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds")
HAVE_RETAIL_BYTES = (BUCK_INSTALL / "GAME.OVR").exists() and (COAB_INSTALL / "GAME.OVR").exists()


def handler(word_set: int | None, seg: int = 0x1234, off: int = 0x5678, *, prologue: bytes = b"\x55\x89\xe5") -> bytes:
    """`push bp; mov bp,sp[; mov al,N; push ax; lcall seg:off]; retf` -- a minimal synthetic Gen1
    command handler. `word_set=None` omits the operand-parser call entirely (a genuine 0-operand
    handler, or one whose call falls outside the test's own scan window)."""
    body = prologue
    if word_set is not None:
        body += bytes([0xB0, word_set & 0xFF])  # mov al, word_set
        body += b"\x50"  # push ax
        body += b"\x9a" + struct.pack("<HH", off, seg)  # lcall off:seg (capstone renders seg, off)
    body += b"\xcb"  # retf
    return body


def pack_handlers(*bodies: bytes) -> tuple[bytes, list[dict[str, int]]]:
    """Concatenate handler bodies back to back and return (blob, dispatch_rows) pointing at each
    one's start offset, opcode 0..N-1 in order."""
    blob = b""
    rows: list[dict[str, int]] = []
    for opcode, body in enumerate(bodies):
        rows.append({"opcode": opcode, "handler_file_offset": len(blob)})
        blob += body
    return blob, rows


class FirstFarCallTests(unittest.TestCase):
    def test_finds_the_first_lcall(self) -> None:
        data = handler(2, seg=0x1234, off=0x5678)
        self.assertEqual(subject._first_far_call(data, 0), "0x1234, 0x5678")

    def test_none_when_the_handler_returns_without_a_call(self) -> None:
        data = handler(None)
        self.assertIsNone(subject._first_far_call(data, 0))


class DeriveOperandParserCallTargetTests(unittest.TestCase):
    def test_majority_target_wins(self) -> None:
        blob, rows = pack_handlers(
            handler(1, seg=0xAAAA, off=0x1111),
            handler(2, seg=0xAAAA, off=0x1111),
            handler(3, seg=0xAAAA, off=0x1111),
            handler(1, seg=0xBBBB, off=0x2222),
        )
        target, first_count, total = subject.derive_operand_parser_call_target(blob, rows, min_share=0.5)
        self.assertEqual(target, "0xaaaa, 0x1111")
        self.assertEqual((first_count, total), (3, 4))

    def test_mutation_below_majority_threshold_raises(self) -> None:
        # Named mutation: split the same four handlers 2/2 across two DIFFERENT call targets --
        # no single target reaches the 50% bar, so the tool must refuse to pick a plurality winner
        # rather than silently guessing (this is the check that would have caught a coincidental
        # near-tie being mistaken for "the" operand parser).
        blob, rows = pack_handlers(
            handler(1, seg=0xAAAA, off=0x1111),
            handler(2, seg=0xBBBB, off=0x2222),
            handler(3, seg=0xAAAA, off=0x1111),
            handler(1, seg=0xBBBB, off=0x2222),
        )
        # Force a tie by adding one more handler using a THIRD target, so the best share is 2/5 = 40%.
        extra = handler(4, seg=0xCCCC, off=0x3333)
        offset = len(blob)
        blob += extra
        rows.append({"opcode": 4, "handler_file_offset": offset})
        with self.assertRaisesRegex(ValueError, "no operand-parser call target reaches"):
            subject.derive_operand_parser_call_target(blob, rows, min_share=0.5)

    def test_no_calls_at_all_raises(self) -> None:
        blob, rows = pack_handlers(handler(None), handler(None))
        with self.assertRaisesRegex(ValueError, "no handler makes any far call"):
            subject.derive_operand_parser_call_target(blob, rows)


class OperandWordSetsTests(unittest.TestCase):
    def test_reads_the_al_immediate_before_the_target_call(self) -> None:
        blob, rows = pack_handlers(
            handler(0, seg=0x1234, off=0x5678),
            handler(3, seg=0x1234, off=0x5678),
            handler(None),
        )
        result = subject.operand_word_sets(blob, rows, "0x1234, 0x5678")
        self.assertEqual(result, {0: 0, 1: 3, 2: None})

    def test_mutation_wrong_target_yields_all_none(self) -> None:
        # Named mutation: ask for a call target that never appears. Every opcode must come back
        # unmeasured rather than the tool falling back to "the first lcall it happens to see".
        blob, rows = pack_handlers(
            handler(0, seg=0x1234, off=0x5678),
            handler(3, seg=0x1234, off=0x5678),
        )
        result = subject.operand_word_sets(blob, rows, "0x9999, 0x9999")
        self.assertEqual(result, {0: None, 1: None})

    def test_a_call_before_the_operand_parser_call_does_not_confuse_the_al_tracker(self) -> None:
        # A handler that makes an unrelated far call first (e.g. a state check), THEN loads AL and
        # calls the real operand parser, must still report the AL value immediately preceding the
        # *matched* call, not stale state left over from before the unrelated call.
        prologue = b"\x55\x89\xe5" + b"\x9a" + struct.pack("<HH", 0x9999, 0x9999)  # unrelated lcall first
        blob = prologue + bytes([0xB0, 5]) + b"\x50" + b"\x9a" + struct.pack("<HH", 0x5678, 0x1234) + b"\xcb"
        rows = [{"opcode": 0, "handler_file_offset": 0}]
        result = subject.operand_word_sets(blob, rows, "0x1234, 0x5678")
        self.assertEqual(result, {0: 5})


class StopReasonsTests(unittest.TestCase):
    def test_no_far_call_at_all(self) -> None:
        # A handler with zero calls of any kind: the strongest possible zero-operand signal.
        blob, rows = pack_handlers(handler(None))
        measured = {0: None}
        reasons = subject.stop_reasons(blob, rows, measured, "0x1234, 0x5678")
        self.assertEqual(reasons, {0: {"reason": "no_far_call", "far_call_targets": []}})

    def test_different_far_call_target(self) -> None:
        # A handler that calls something OTHER than the derived operand-parser target must not be
        # credited as zero-operand -- it may consume operands through an unidentified mechanism.
        prologue = b"\x55\x89\xe5" + b"\x9a" + struct.pack("<HH", 0x9999, 0x9999) + b"\xcb"
        blob = prologue
        rows = [{"opcode": 0, "handler_file_offset": 0}]
        measured = {0: None}
        reasons = subject.stop_reasons(blob, rows, measured, "0x1234, 0x5678")
        self.assertEqual(reasons[0]["reason"], "different_far_call_target")
        self.assertEqual(reasons[0]["far_call_targets"], ["0x9999, 0x9999"])

    def test_mutation_reversing_no_far_call_and_different_target(self) -> None:
        # Named mutation: a handler with ONE far call to an unrelated target must land in
        # "different_far_call_target", never "no_far_call" -- if the classifier collapsed both
        # into one bucket this assertion goes red.
        empty_blob, empty_rows = pack_handlers(handler(None))
        calling_prologue = b"\x55\x89\xe5" + b"\x9a" + struct.pack("<HH", 0x1111, 0x2222) + b"\xcb"
        calling_rows = [{"opcode": 0, "handler_file_offset": 0}]
        measured = {0: None}
        empty_reason = subject.stop_reasons(empty_blob, empty_rows, measured, "0xaaaa, 0xbbbb")[0]["reason"]
        calling_reason = subject.stop_reasons(calling_prologue, calling_rows, measured, "0xaaaa, 0xbbbb")[0]["reason"]
        self.assertEqual(empty_reason, "no_far_call")
        self.assertEqual(calling_reason, "different_far_call_target")
        self.assertNotEqual(empty_reason, calling_reason)

    def test_measured_opcodes_are_omitted(self) -> None:
        blob, rows = pack_handlers(handler(2, seg=0x1234, off=0x5678), handler(None))
        measured = {0: 2, 1: None}
        reasons = subject.stop_reasons(blob, rows, measured, "0x1234, 0x5678")
        self.assertEqual(set(reasons), {1})

    def test_ran_past_scan_window_when_neither_call_nor_ret_appears(self) -> None:
        # A handler body that never reaches a ret/retf/iret OR the call target inside the scan
        # window is inconclusive, not a zero-operand claim.
        blob = b"\x90" * 50  # NOPs only, no ret/retf/iret, no call
        rows = [{"opcode": 0, "handler_file_offset": 0}]
        measured = {0: None}
        reasons = subject.stop_reasons(blob, rows, measured, "0x1234, 0x5678", max_size=50)
        self.assertEqual(reasons[0]["reason"], "ran_past_scan_window")

    def test_far_call_targets_are_deduplicated_and_capped_at_three(self) -> None:
        prologue = b"\x55\x89\xe5"
        calls = b"".join(b"\x9a" + struct.pack("<HH", off, 0x1111) for off in (1, 1, 2, 3, 4))
        blob = prologue + calls + b"\xcb"
        rows = [{"opcode": 0, "handler_file_offset": 0}]
        measured = {0: None}
        reasons = subject.stop_reasons(blob, rows, measured, "0x9999, 0x9999")
        self.assertEqual(len(reasons[0]["far_call_targets"]), 3)
        self.assertEqual(
            reasons[0]["far_call_targets"],
            ["0x1111, 1", "0x1111, 2", "0x1111, 3"],
        )


class FindOperandParserPcGlobalTests(unittest.TestCase):
    def test_finds_the_single_read_and_write_candidate(self) -> None:
        # mov ax, [0x3be2] (read, A1 direct-address form); inc word ptr [0x3be2] (write); retf.
        # This is the exact evidentiary shape verified against Buck's real parser at 0x1ca15.
        code = bytes([0xA1, 0xE2, 0x3B]) + bytes([0xFF, 0x06, 0xE2, 0x3B]) + b"\xcb"
        self.assertEqual(subject.find_operand_parser_pc_global(code, 0), [0x3BE2])

    def test_add_immediate_also_counts_as_a_write(self) -> None:
        code = bytes([0xA1, 0xE2, 0x3B]) + bytes([0x83, 0x06, 0xE2, 0x3B, 0x03]) + b"\xcb"
        self.assertEqual(subject.find_operand_parser_pc_global(code, 0), [0x3BE2])

    def test_a_read_only_address_is_not_a_candidate(self) -> None:
        # Read but never written anywhere in the function -- must not be reported as the PC global.
        code = bytes([0xA1, 0xE2, 0x3B]) + b"\xcb"
        self.assertEqual(subject.find_operand_parser_pc_global(code, 0), [])

    def test_a_write_only_address_is_not_a_candidate(self) -> None:
        # Named mutation companion: written but never read via the AX-direct-address form -- both
        # conditions are required, not just one.
        code = bytes([0xFF, 0x06, 0xE2, 0x3B]) + b"\xcb"
        self.assertEqual(subject.find_operand_parser_pc_global(code, 0), [])


class DescriptorContainingTests(unittest.TestCase):
    def test_returns_the_owning_descriptor(self) -> None:
        d1 = SimpleNamespace(ovr_file_offset=0x100, code_size=0x50)
        d2 = SimpleNamespace(ovr_file_offset=0x200, code_size=0x50)
        self.assertIs(subject._descriptor_containing([d1, d2], 0x210), d2)

    def test_none_when_no_descriptor_contains_the_offset(self) -> None:
        d1 = SimpleNamespace(ovr_file_offset=0x100, code_size=0x50)
        self.assertIsNone(subject._descriptor_containing([d1], 0x500))


class WalkFarCallChainTests(unittest.TestCase):
    def _descriptor(self, base: int, size: int) -> SimpleNamespace:
        return SimpleNamespace(ovr_file_offset=base, code_size=size)

    def test_touching_the_pc_global_directly_is_detected(self) -> None:
        code = bytes([0xA1, 0xE2, 0x3B]) + b"\xcb"  # mov ax, [0x3be2]; retf
        layouts = [self._descriptor(0, len(code))]
        result = subject.walk_far_call_chain(code, layouts, {}, 0, (0x99, 0x99), 0x3BE2)
        self.assertTrue(result["touched_pc"])
        self.assertFalse(result["called_parser"])

    def test_calling_the_parser_pair_directly_is_detected(self) -> None:
        code = b"\x9a" + struct.pack("<HH", 0x2A, 0xB8) + b"\xcb"  # lcall 0xb8, 0x2a; retf
        layouts = [self._descriptor(0, len(code))]
        result = subject.walk_far_call_chain(code, layouts, {}, 0, (0xB8, 0x2A), 0x3BE2)
        self.assertTrue(result["called_parser"])
        self.assertFalse(result["touched_pc"])
        self.assertIn("0xb8, 0x2a", result["far_calls_seen"])

    def test_resolved_far_call_is_followed_and_finds_the_pc_touch_in_the_callee(self) -> None:
        # Entry at 0 makes a far call to (0xaa, 0x10); its resolved callee lives at file offset
        # 0x40 and touches the PC global -- the walk must recurse into it and report touched_pc.
        entry = b"\x9a" + struct.pack("<HH", 0x10, 0xAA) + b"\xcb"
        callee = bytes([0xA1, 0xE2, 0x3B]) + b"\xcb"
        code = entry.ljust(0x40, b"\x90") + callee
        layouts = [self._descriptor(0, len(code))]
        resolved_pairs = {(0xAA, 0x10): SimpleNamespace(route_kind="public_stub_owned", target_ovr_file_offset=0x40)}
        result = subject.walk_far_call_chain(code, layouts, resolved_pairs, 0, (0x99, 0x99), 0x3BE2)
        self.assertTrue(result["touched_pc"])
        self.assertIn("0xaa, 0x10", result["far_calls_seen"])
        self.assertEqual(result["unresolved_far_calls"], [])

    def test_an_unresolved_far_call_is_reported_resident_and_not_followed(self) -> None:
        code = b"\x9a" + struct.pack("<HH", 0x62A, 0xBE4) + b"\xcb"
        layouts = [self._descriptor(0, len(code))]
        result = subject.walk_far_call_chain(code, layouts, {}, 0, (0x99, 0x99), 0x3BE2)
        self.assertFalse(result["touched_pc"])
        self.assertFalse(result["called_parser"])
        self.assertEqual(result["unresolved_far_calls"], ["0xbe4, 0x62a"])
        self.assertEqual(result["resident_targets"], ["0xbe4, 0x62a"])

    def test_a_near_call_inside_the_same_descriptor_is_followed(self) -> None:
        callee_offset = 0x20
        entry = b"\xe8" + struct.pack("<h", callee_offset - 3) + b"\xcb"
        callee = bytes([0xA1, 0xE2, 0x3B]) + b"\xcb"
        code = entry.ljust(callee_offset, b"\x90") + callee
        layouts = [self._descriptor(0, len(code))]
        result = subject.walk_far_call_chain(code, layouts, {}, 0, (0x99, 0x99), 0x3BE2)
        self.assertTrue(result["touched_pc"])
        self.assertIn(f"0x{callee_offset:x}", result["near_calls_seen"])

    def test_a_near_call_outside_the_descriptor_bounds_is_not_followed(self) -> None:
        # Named mutation: a near call jumping OUTSIDE this descriptor's own code bounds must not
        # be treated as reachable (a near call cannot legally cross a VROOMM overlay boundary) --
        # if this bound were dropped, an out-of-descriptor jump could be mis-walked as reachable.
        far_away = 0x1000
        entry = b"\xe8" + struct.pack("<h", far_away - 3) + b"\xcb"
        layouts = [self._descriptor(0, len(entry))]
        result = subject.walk_far_call_chain(entry, layouts, {}, 0, (0x99, 0x99), 0x3BE2)
        self.assertEqual(result["near_calls_seen"], [])
        self.assertFalse(result["touched_pc"])

    def test_max_depth_bounds_the_recursion(self) -> None:
        # A resolved far call A->B, where only B touches the PC. With max_depth=0 the walk must
        # never leave A's own body, so touched_pc stays False and only one node is visited.
        call_a_to_b = b"\x9a" + struct.pack("<HH", 0x10, 0xAA) + b"\xcb"
        callee_b = bytes([0xA1, 0xE2, 0x3B]) + b"\xcb"
        code = call_a_to_b.ljust(0x40, b"\x90") + callee_b
        layouts = [self._descriptor(0, len(code))]
        resolved_pairs = {(0xAA, 0x10): SimpleNamespace(route_kind="public_stub_owned", target_ovr_file_offset=0x40)}
        result = subject.walk_far_call_chain(
            code, layouts, resolved_pairs, 0, (0x99, 0x99), 0x3BE2, max_depth=0
        )
        self.assertFalse(result["touched_pc"])
        self.assertEqual(result["nodes_visited"], 1)


class CompareToKnownDialectsTests(unittest.TestCase):
    def test_agrees_with_long_dialect(self) -> None:
        # 0x01 GOTO is wordSet 1 in both LONG_WORD_SETS and (unmodified) the short overrides.
        report = subject.compare_to_known_dialects({0x01: 1})
        self.assertEqual([row["opcode"] for row in report["agree"]], [0x01])
        self.assertEqual(report["disagree"], [])

    def test_disagrees_with_both(self) -> None:
        # 0x1D is long=1, short=0; measuring 2 must land in "disagree", not silently pass.
        report = subject.compare_to_known_dialects({0x1D: 2})
        self.assertEqual(report["agree"], [])
        self.assertEqual([row["opcode"] for row in report["disagree"]], [0x1D])

    def test_mutation_agreeing_value_must_not_land_in_disagree(self) -> None:
        # Named mutation: feed the LONG value for an opcode where long != short (0x0C: long=3,
        # short=4). Measuring exactly 3 must be an agreement (with the long dialect), proving the
        # comparator checks "matches EITHER", not "matches a single hard-coded column".
        report = subject.compare_to_known_dialects({0x0C: 3})
        self.assertEqual([row["opcode"] for row in report["agree"]], [0x0C])

    def test_unmeasured_and_extended_are_separated(self) -> None:
        report = subject.compare_to_known_dialects({0x01: None, 0x41: 2, 0x4C: None})
        self.assertEqual(report["unmeasured"], [0x01])
        self.assertEqual([row["opcode"] for row in report["extended"]], [0x41, 0x4C])


class RenderMarkdownTests(unittest.TestCase):
    """Exercises the renderer without needing real GAME.OVR bytes (mirrors
    test_map_dok_ecl_dispatch.py's synthetic-report approach)."""

    def _shape(self, offset: int, size: int, count: int) -> dict:
        return {"offset": offset, "size": size, "instruction_count": count, "tokens": ()}

    def test_renders_disagreements_and_headline_numbers(self) -> None:
        report = {
            "matches": {
                "dispatcher": {
                    "buck": self._shape(0x36D0, 0x281, 359),
                    "coab": self._shape(0x3CAB, 0x100, 288),
                    "sequence_similarity": 0.8872,
                    "trigram_jaccard": 0.4615,
                },
                "operand_parser": {
                    "buck": self._shape(0x1CA15, 0x136, 150),
                    "coab": self._shape(0x810A, 0x136, 119),
                    "sequence_similarity": 0.8550,
                    "trigram_jaccard": 0.8276,
                },
            },
            "buck_dispatch": [{"opcode": 0x1D, "handler_file_offset": 0x1CC7, "source": "linear"}],
            "buck_opcodes": [0x1D],
            "buck_opcode_min": 0x1D,
            "buck_opcode_max": 0x1D,
            "buck_handler_count": 1,
            "buck_fallthrough_resolved_count": 0,
            "missing_within_range": [],
            "coab_opcode_max": 0x40,
            "coab_missing_within_range": [],
            "shared_missing_signature_within_0x40": [],
            "operand_parser_call_target": {"target": "0xb8, 0x2a", "handlers_using_it_first": 43, "handlers_total": 63},
            "word_sets": {"29": 2},
            "dialect_comparison": {
                "agree": [],
                "disagree": [{"opcode": 0x1D, "measured_word_set": 2, "long_dialect_word_set": 1, "short_dialect_word_set": 0}],
                "unmeasured": [],
                "extended": [],
            },
            "claim_boundary": "test claim boundary",
        }
        markdown = subject.render_markdown(report)
        self.assertIn("0x36d0", markdown)
        self.assertIn("| `0x1d` | `2` | `1` | `0` |", markdown)
        self.assertIn("| `0x1d` | `0x1cc7` | `2` | linear |", markdown)


@unittest.skipUnless(HAVE_RETAIL_BYTES, "needs the real Buck + CoAB GAME.OVR files (external, never-vendored)")
class RealBytesIntegrationTests(unittest.TestCase):
    """Pins the numbers this round actually measured against the retail binaries, so a future
    change to the shared matching machinery (map_pool_ecl_dispatch.py) that quietly breaks Buck's
    match will be caught here even though this tool has no CoAB oracle correlation-cluster entry
    to fall back on."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.report = subject.build_report()

    def test_dispatcher_and_parser_offsets(self) -> None:
        self.assertEqual(self.report["matches"]["dispatcher"]["buck"]["offset"], 0x36D0)
        self.assertEqual(self.report["matches"]["operand_parser"]["buck"]["offset"], 0x1CA15)

    def test_similarity_is_decisively_above_noise(self) -> None:
        # The measured floor this round (0.887 / 0.855) is below the 0.95 bar the DoK/Pool tools
        # hit (their titles share CoAB's own FBOV compiler build far more closely); Buck's TPOV
        # binary is a different link entirely. Pin a lower, still-decisive floor instead of
        # inventing false precision -- see the report for the >3x gap over the runner-up candidate.
        for name in ("dispatcher", "operand_parser"):
            self.assertGreaterEqual(self.report["matches"][name]["sequence_similarity"], 0.8)

    def test_opcode_range_and_handler_count(self) -> None:
        self.assertEqual(self.report["buck_opcode_min"], 0x00)
        self.assertEqual(self.report["buck_opcode_max"], 0x4C)
        # 63 handlers the plain linear `cmp al,imm; call H` scan finds directly, plus 12 more
        # recovered by following a `cmp al,N; je/jne` fallthrough chain into a neighbor's shared
        # handler body (see resolve_fallthrough_dispatch) -- 75 total, still only 2 genuinely
        # missing (0x1f, 0x3b) inside the 0x00-0x4c range.
        self.assertEqual(self.report["buck_handler_count"], 75)
        self.assertEqual(self.report["buck_fallthrough_resolved_count"], 12)
        self.assertEqual(self.report["missing_within_range"], [0x1F, 0x3B])

    def test_missing_opcode_signature_matches_coab_exactly_within_0x40(self) -> None:
        # CoAB is run through the SAME two-pass method (linear scan, then the identical
        # fallthrough resolver) so this stays an apples-to-apples comparison: CoAB's own table
        # has exactly one gap left (0x1f) after that resolution, and Buck is missing it too.
        coab_missing = self.report["coab_missing_within_range"]
        shared = self.report["shared_missing_signature_within_0x40"]
        self.assertEqual(coab_missing, [0x1F])
        self.assertEqual(len(shared), len(coab_missing))
        self.assertEqual(set(shared), set(coab_missing))

    def test_dialect_comparison_counts(self) -> None:
        # Before the fallthrough resolver, this was 31 agree / 7 disagree / 13 unmeasured / 12
        # extended. The resolver added 12 more measured opcodes (0x04-0x06, 0x11, 0x16-0x1a,
        # 0x21, 0x25, 0x2f); 7 of them (0x04, 0x05, 0x06, 0x11, 0x21, 0x25, 0x2f) measured a word
        # set that agrees with the long dialect, and the other 5 (the IF_* family at 0x16-0x1a,
        # which share a handler that never reaches the operand-parser call) came back unmeasured.
        # 7 + 5 = 12, disagree is untouched, extended is untouched (all fallthrough-resolved
        # opcodes are <= 0x40) -- this is the actual, verified accounting, not the plan's guess.
        comparison = self.report["dialect_comparison"]
        self.assertEqual(len(comparison["agree"]), 38)
        self.assertEqual(len(comparison["disagree"]), 7)
        self.assertEqual(len(comparison["unmeasured"]), 18)
        self.assertEqual(len(comparison["extended"]), 12)

    def test_stop_reasons_for_the_desync_attribution_round(self) -> None:
        # R6 (2026-09-03): the specific opcodes buck-ecl-desyncs.md's attribution table depends on.
        # 0x29 (ENCOUNTER_MENU, the handler directly upstream of two of the seven pinned desync
        # sites) and 0x2c (PARLAY) both call OTHER far routines and must NOT read as zero-operand.
        # 0x3c (PROTECTION) and the three beyond-0x40 extensions 0x44/0x47/0x4a make no call at
        # all -- the strongest possible zero-operand signal, which is why ECL_GEN1_BUCK models
        # 0x3c/0x44/0x47/0x4a as wordSet 0 in disassemble.ts. 0x42 also calls other routines and
        # stays unmodeled.
        reasons = self.report["stop_reasons"]
        self.assertEqual(reasons["41"]["reason"], "different_far_call_target")  # 0x29
        self.assertEqual(reasons["41"]["far_call_targets"], ["0xbe4, 0x62a", "0xb8, 0x7f", "0x653, 0x1359"])
        self.assertEqual(reasons["44"]["reason"], "different_far_call_target")  # 0x2c
        self.assertEqual(reasons["60"], {"reason": "no_far_call", "far_call_targets": []})  # 0x3c
        self.assertEqual(reasons["66"]["reason"], "different_far_call_target")  # 0x42
        self.assertEqual(reasons["66"]["far_call_targets"], ["0x653, 0xe58", "0xb8, 0xb6"])
        self.assertEqual(reasons["68"], {"reason": "no_far_call", "far_call_targets": []})  # 0x44
        self.assertEqual(reasons["71"], {"reason": "no_far_call", "far_call_targets": []})  # 0x47
        self.assertEqual(reasons["74"], {"reason": "no_far_call", "far_call_targets": []})  # 0x4a
        # Mutation: an opcode with a real measured word set must never appear in stop_reasons --
        # if the omission check in stop_reasons() were dropped this would go red.
        self.assertNotIn("76", reasons)  # 0x4c is measured (word set 2), not unmeasured

    def test_far_call_resolution_resolves_three_targets_but_no_opcode_fully_resolves(self) -> None:
        # Round 31 R1 retraction: round 30's blanket "every target stays unresolved" was correct
        # about the LINEAR-fit method (tools/buck_far_targets.py's fit table still fails the same
        # way -- see tools/test_buck_far_targets.py) but wrong as a claim about the seven targets
        # themselves. Three of them are `public_stub_owned` under vroomm_layout.py's own
        # descriptor/stub geometry -- a different, non-linear resolution method -- and resolve to
        # real GAME.OVR file offsets. No OPCODE's overall status flips to "resolved" though,
        # because every opcode here still has at least one target sitting on a genuinely resident
        # segment (`0xbe4`/`0x653`) that neither method reaches.
        resolution = self.report["far_call_resolution"]
        self.assertEqual(resolution["41"]["status"], "unresolved")  # 0x29
        self.assertEqual(resolution["44"]["status"], "unresolved")  # 0x2c
        self.assertEqual(resolution["66"]["status"], "unresolved")  # 0x42

        by_target = {
            row["target"]: row
            for key in ("41", "44", "66")
            for row in resolution[key]["targets"]
        }
        resolved = {"0xb8, 0x7f": "0x1e0f2", "0xb8, 0xb6": "0x1e98e", "0x10f, 0x4d": "0x2d9cd"}
        unresolved = ["0xbe4, 0x62a", "0x653, 0x1359", "0xbe4, 0x1b2b", "0x653, 0xe58"]
        for target, file_offset in resolved.items():
            row = by_target[target]
            self.assertEqual(row["status"], "resolved")
            self.assertEqual(row["resolution_method"], "stub_geometry")
            self.assertEqual(row["file_offset"], file_offset)
        for target in unresolved:
            row = by_target[target]
            self.assertEqual(row["status"], "unresolved")
            self.assertNotIn("file_offset", row)
        for key in ("41", "44", "66"):
            self.assertIsNone(resolution[key]["resolved_operand_count"])
        # Mutation: an opcode with a real measured word set must never appear in the new column
        # either -- far_call_resolution_summary is built from the same reasons dict stop_reasons
        # already omits measured opcodes from.
        self.assertNotIn("76", resolution)  # 0x4c

    def test_script_bytes_consumed_verdicts_for_the_three_opcodes(self) -> None:
        # Deliverable 2, round 32 R5 update: round 31 could only report `unknown (resident
        # callee ...)` for these three opcodes because their remaining unresolved far-call
        # targets (0xbe4/0x653/0x10f pairs) sit on genuinely EXEPACK-compressed, on-disk-only
        # code -- nothing could be read there. `tools/exepack_unpack.py` decompresses Buck's own
        # START.EXE (69760-byte dest_len image, confirmed below) and `build_report`'s
        # `use_resident_image=True` default now threads that image into the SAME walk, which can
        # follow those far calls into resident space. All three now conclusively verdict `0`
        # (superseding round 31's `unknown`; see docs/engine/research/buck-ecl-desyncs.md's
        # round 32 R5 section) -- 3 of the plan's own "Buck unknown 4->less-or-equal 1" bar.
        self.assertTrue(self.report["resident_image_used"])
        self.assertEqual(self.report["resident_image_dest_len_bytes"], 69760)
        verdicts = self.report["script_bytes_consumed"]
        for opcode in ("0x29", "0x2c", "0x42"):
            info = verdicts[opcode]
            self.assertEqual(info["pc_global"], "0x3be2")
            self.assertEqual(info["verdict"], "0")
            self.assertEqual(info["resident_blocking"], [])
            # No walk anywhere in this opcode's targets ever touched the PC or called the parser --
            # the null this claim depends on: if either flipped True the verdict would be `N`.
            for walk in info["walks"].values():
                self.assertFalse(walk["touched_pc"])
                self.assertFalse(walk["called_parser"])
                # Truncation-vs-exhaustion null: every walk here ran with max_nodes=5000: if any
                # walk's own nodes_visited landed AT that cap, a clean `0` could be an artifact of
                # the search being cut off rather than the graph being exhausted. The largest
                # observed walk (Deliverable 2's own `0xb8, 0x7f` target) visits 113 nodes --
                # nowhere near the cap -- so these are exhaustive, not truncated, verdicts.
                self.assertLess(walk["nodes_visited"], 200)

    def test_resident_image_off_reproduces_round_31_exactly(self) -> None:
        # `use_resident_image=False` is kept precisely so round 31's original, resident-blind
        # numbers stay reproducible on request -- pin them here so a future change to the walk
        # cannot silently break BOTH modes at once without at least one of these two tests
        # noticing.
        report = subject.build_report(use_resident_image=False)
        self.assertFalse(report["resident_image_used"])
        self.assertIsNone(report["resident_image_dest_len_bytes"])
        verdicts = report["script_bytes_consumed"]
        for opcode in ("0x29", "0x2c", "0x42"):
            info = verdicts[opcode]
            self.assertTrue(info["verdict"].startswith("unknown (resident callee "))
            self.assertGreater(len(info["resident_blocking"]), 0)

    def test_buck_specific_word_sets_are_grounded_not_borrowed(self) -> None:
        # These seven opcodes measured a word set matching NEITHER the long nor the short dialect
        # -- Buck's own retail evidence, not an inference from another title's table.
        disagree_by_opcode = {row["opcode"]: row["measured_word_set"] for row in self.report["dialect_comparison"]["disagree"]}
        self.assertEqual(
            disagree_by_opcode,
            {0x1D: 2, 0x22: 3, 0x23: 3, 0x27: 2, 0x31: 2, 0x3F: 2, 0x40: 2},
        )

    def test_vacuous_opcode_walk_partitions_the_22(self) -> None:
        # Deliverable 4 (round 32 R5): of Buck's 22 opcodes with `measured word set: None`, 5 are
        # `no_far_call` (the strongest possible zero-operand signal, already modelled elsewhere)
        # and are NOT walked here; the other 17 are `different_far_call_target` and this is the
        # generalisation of the hand-picked `0x29`/`0x2c`/`0x42` walk to all of them.
        walk = self.report["vacuous_opcode_walk"]
        self.assertEqual(len(walk), 17)
        touches_pc = {op for op, info in walk.items() if info["verdict"].startswith("N ")}
        verdict_zero = {op for op, info in walk.items() if info["verdict"] == "0"}
        # IF_EQ..IF_GE (0x16..0x1b): the ONLY six that touch the PC global. Their base-table
        # wordSet is already 0, and this is NOT reinterpreted as a disagreement -- a conditional
        # opcode legitimately manipulates the script cursor to skip instructions without that
        # being an extra operand (see walk_vacuous_opcodes's own docstring).
        self.assertEqual(touches_pc, {"0x16", "0x17", "0x18", "0x19", "0x1a", "0x1b"})
        self.assertEqual(len(verdict_zero), 11)
        self.assertIn("0x29", verdict_zero)
        self.assertIn("0x2c", verdict_zero)
        self.assertIn("0x42", verdict_zero)
        # Truncation-vs-exhaustion null, same as the three hand-picked opcodes: every walk here
        # ran with max_nodes=5000 (walk_vacuous_opcodes's own default); the largest single walk
        # observed visits 469 nodes (opcode 0x24's `0x65, 0x25` target) -- nowhere near the cap.
        for op, info in walk.items():
            for target, w in info["walks"].items():
                if w.get("resident"):
                    continue
                self.assertLess(w["nodes_visited"], 1000, f"{op} {target}")


if __name__ == "__main__":
    unittest.main()
