from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from map_secret_behavior_clusters import (  # noqa: E402
    REPLAYED_OPCODES,
    build_command_entry,
    build_function_entry,
    classify_clusters,
)


FUNC_BYTES = bytes.fromhex("5589e5" "5dc3")  # push bp; mov bp,sp; pop bp; ret
SOURCE = "C:/fake/GAME.OVR"


def make_data(offset: int) -> tuple[bytes, list[int]]:
    data = b"\x90" * offset + FUNC_BYTES + b"\x90" * 0x10
    return data, [offset]


class ClassifyClustersTests(unittest.TestCase):
    """The join tool's central rule: a bare structural (`control-flow-shape`) match must
    never be treated the same as a real cross-title identity match."""

    def test_no_clusters_is_a_secret_local_singleton(self) -> None:
        self.assertEqual(classify_clusters([]), "secret-local-singleton")

    def test_shape_only_cluster_is_not_promoted(self) -> None:
        clusters = [{"match_kind": "control-flow-shape", "confidence": "medium", "source_count": 4}]
        self.assertEqual(classify_clusters(clusters), "structural-shape-only")

    def test_exact_cluster_is_a_candidate(self) -> None:
        clusters = [{"match_kind": "exact", "confidence": "low", "source_count": 2}]
        self.assertEqual(classify_clusters(clusters), "cross-title-exact-candidate")

    def test_relocation_normalized_cluster_is_a_candidate(self) -> None:
        clusters = [{"match_kind": "relocation-normalized", "confidence": "high", "source_count": 5}]
        self.assertEqual(classify_clusters(clusters), "cross-title-exact-candidate")

    def test_exact_wins_over_a_coexisting_shape_only_hit(self) -> None:
        clusters = [
            {"match_kind": "control-flow-shape", "confidence": "medium", "source_count": 4},
            {"match_kind": "exact", "confidence": "low", "source_count": 2},
        ]
        self.assertEqual(classify_clusters(clusters), "cross-title-exact-candidate")


class BuildCommandEntryTests(unittest.TestCase):
    def test_missing_handler_is_dispatcher_internal_and_never_carved(self) -> None:
        data, starts = make_data(0x10)
        entry = build_command_entry(
            0x25, "ON_GOTO", handler_offsets={}, dispatcher_offset=0x10,
            data=data, starts=starts, patterns={"function_cluster_index": [], "function_clusters": []},
            calls={"correlations": []}, source=SOURCE,
        )
        self.assertEqual(entry["mapping"], "dispatcher-internal")
        self.assertEqual(entry["promotion_status"], "dispatcher-internal")
        self.assertEqual(entry["dispatcher_file_offset"], 0x10)
        self.assertNotIn("handler_file_offset", entry)
        self.assertNotIn("clusters", entry)

    def test_handler_with_no_cluster_evidence_is_a_local_singleton(self) -> None:
        data, starts = make_data(0x20)
        entry = build_command_entry(
            0x09, "SAVE", handler_offsets={0x09: 0x20}, dispatcher_offset=0x10,
            data=data, starts=starts, patterns={"function_cluster_index": [], "function_clusters": []},
            calls={"correlations": []}, source=SOURCE,
        )
        self.assertEqual(entry["mapping"], "direct-dispatch-handler")
        self.assertEqual(entry["handler_file_offset"], 0x20)
        self.assertEqual(entry["promotion_status"], "secret-local-singleton")
        self.assertEqual(entry["clusters"], [])
        self.assertEqual(entry["inbound_vroomm_calls"], [])

    def test_handler_with_shape_only_cluster_stays_unpromoted(self) -> None:
        data, starts = make_data(0x20)
        offset = 0x20
        patterns = {
            "function_cluster_index": [],
            "function_clusters": [{
                "match_kind": "control-flow-shape",
                "confidence": "medium",
                "source_count": 4,
                "shape_sha256": "deadbeef",
                "candidates": [{"source": SOURCE, "offset": offset}],
            }],
        }
        entry = build_command_entry(
            0x09, "SAVE", handler_offsets={0x09: offset}, dispatcher_offset=0x10,
            data=data, starts=starts, patterns=patterns, calls={"correlations": []}, source=SOURCE,
        )
        self.assertEqual(entry["promotion_status"], "structural-shape-only")
        self.assertTrue(entry["clusters"])
        self.assertEqual(entry["clusters"][0]["match_kind"], "control-flow-shape")

    def test_handler_with_exact_cluster_and_inbound_calls_is_a_candidate(self) -> None:
        data, starts = make_data(0x20)
        offset = 0x20
        patterns = {
            "function_cluster_index": [{
                "source": SOURCE,
                "offset": offset,
                "match_kind": "exact",
                "confidence": "low",
                "source_count": 2,
                "normalized_sha256": "abc123",
            }],
            "function_clusters": [],
        }
        calls = {"correlations": [{
            "target_source": SOURCE,
            "target_offset": offset,
            "call_count": 7,
            "caller_profiles": ["secret-of-the-silver-blades"],
            "route_kind": "public_stub_owned",
            "confidence": "high",
        }]}
        entry = build_command_entry(
            0x24, "COMBAT", handler_offsets={0x24: offset}, dispatcher_offset=0x10,
            data=data, starts=starts, patterns=patterns, calls=calls, source=SOURCE,
        )
        self.assertEqual(entry["promotion_status"], "cross-title-exact-candidate")
        self.assertEqual(entry["inbound_vroomm_calls"][0]["call_count"], 7)


class BuildFunctionEntryTests(unittest.TestCase):
    def test_carves_role_and_reports_similarity_evidence(self) -> None:
        data, starts = make_data(0x30)
        entry = build_function_entry(
            "dispatcher", 0x30, 0x999, 0.9897, 0.7059,
            data, starts, {"function_cluster_index": [], "function_clusters": []}, {"correlations": []}, SOURCE,
        )
        self.assertEqual(entry["role"], "dispatcher")
        self.assertEqual(entry["file_offset"], 0x30)
        self.assertEqual(entry["coab_reference_offset"], 0x999)
        self.assertEqual(entry["sequence_similarity"], 0.9897)
        self.assertEqual(entry["promotion_status"], "secret-local-singleton")
        # A CoAB reference offset is retained only as evidence metadata, never surfaced as
        # a "secret" symbol name -- the role label itself ("dispatcher") is generic, not a
        # CoAB source symbol (e.g. never "commandTable").
        self.assertNotIn("commandTable", str(entry))

    def test_raises_on_an_offset_that_is_not_a_function_start(self) -> None:
        data, starts = make_data(0x30)
        with self.assertRaises(ValueError):
            build_function_entry(
                "dispatcher", 0x31, 0x999, 0.9, 0.9,
                data, starts, {"function_cluster_index": [], "function_clusters": []}, {"correlations": []}, SOURCE,
            )


class ReplayedOpcodesTests(unittest.TestCase):
    """Guard the hardcoded opcode table against silent drift from the sourced route in
    docs/engine/research/secret-natural-encounter-route.md and the verified opcode spec in
    docs/engine/research/ecl-opcode-spec-for-asm.md."""

    def test_matches_the_documented_natural_encounter_route(self) -> None:
        self.assertEqual(REPLAYED_OPCODES[0x09], "SAVE")
        self.assertEqual(REPLAYED_OPCODES[0x24], "COMBAT")
        self.assertEqual(REPLAYED_OPCODES[0x30], "OR")  # the resume write is an OR, not a SAVE
        self.assertEqual(REPLAYED_OPCODES[0x25], "ON_GOTO")
        self.assertEqual(REPLAYED_OPCODES[0x0B], "LOAD_MONSTER")
        self.assertEqual(len(REPLAYED_OPCODES), 13)

    def test_does_not_silently_reuse_pools_opcode_set(self) -> None:
        # Pool's replayed set (map_pool_behavior_clusters.REPLAYED_OPCODES) is
        # {0x09, 0x0B, 0x1C, 0x24, 0x25, 0x2B}. Secret's own route touches more opcodes
        # (AND/IF_NE/EXIT/SETUP_MONSTER/PRINTCLEAR/GOSUB/OR); this guards against
        # accidentally collapsing Secret's set down to Pool's by copy-paste.
        pool_only = {0x09, 0x0B, 0x1C, 0x24, 0x25, 0x2B}
        self.assertTrue(set(REPLAYED_OPCODES) - pool_only)


if __name__ == "__main__":
    unittest.main()
