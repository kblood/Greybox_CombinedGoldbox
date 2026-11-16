from __future__ import annotations

import sys
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import goldbox_corpus
import correlate_vroomm_calls
import export_decompiler_inputs
import find_geo_path
import gen1_ecl_encounter_scan
import gen1_map
import inventory_goldbox_binaries as inventory
import inspect_pool_save
import map_coab_oracle
import map_pool_behavior_clusters
import map_pool_ecl_dispatch
import match_goldbox_patterns
import parse_dosbox_vroomm_trace
import parse_pool_route_vroomm_trace
import report_guard
import parse_pool_ecl_cursor_trace
import parse_pool_ecl_host_trace
import patch_pool_protection
import patch_pool_ecl_transition
import patch_pool_route_state
import patch_pool_game_area
import clone_pool_save_sidecars
import patch_pool_save_pose
import patch_secret_route_save
import rtlink_map
import vroomm_layout
import xref_goldbox_anchors


class GeoPathTests(unittest.TestCase):
    def test_descriptor_plane_is_masked(self) -> None:
        raw = bytearray(1026)
        raw[514] = 0x86
        raw[515] = 0x7F
        self.assertEqual(find_geo_path.decode_descriptors(bytes(raw), 0x7F)[:2], [6, 0x7F])

    def test_path_avoids_blocked_intermediate_cell(self) -> None:
        cells = [
            {direction: (0, 0) for direction in find_geo_path.DIRECTIONS}
            for _ in range(256)
        ]
        directions, coordinates = find_geo_path.find_path(
            cells, (0, 0), (2, 0), {(1, 0)}
        )
        self.assertNotIn((1, 0), coordinates)
        self.assertEqual(coordinates[-1], (2, 0))
        self.assertGreater(len(directions), 2)


class ProfileDetectionTests(unittest.TestCase):
    def assert_profile(self, expected: str, folder: str, names: set[str]) -> None:
        profile_id, _, confidence, _ = inventory.detect_profile(Path(folder), {name.upper() for name in names})
        self.assertEqual(profile_id, expected)
        self.assertIn(confidence, {"medium", "high"})

    def test_unique_config_markers_win_over_shared_dax_names(self) -> None:
        shared = {"BIGPIC1.DAX", "GEO1.DAX", "ECL1.DAX", "8X8D1.DAX", "START.EXE", "GAME.OVR"}
        self.assert_profile("champions-of-krynn", "Champions of Krynn", shared | {"KRYNN.CFG"})
        self.assert_profile("secret-of-the-silver-blades", "Secret of the Silver Blades", shared | {"BLADES.CFG"})
        self.assert_profile("pools-of-darkness", "Pools of Darkness", shared | {"POOL4.CFG", "GAME.EXE", "ZOUNDS.DAX"})
        self.assert_profile("treasures-of-the-savage-frontier", "Treasures of the Savage Frontier", shared | {"TREASURE.CFG", "ZOUNDS.DAX", "GAME.EXE"})

    def test_buck_rogers_is_separated_by_its_cfg_and_nothing_else(self) -> None:
        """The two Buck games share every DAX name that makes them Buck.

        Until 2026-08-26 `buck-rogers-countdown-to-doomsday` required BUCK1.EXE/BUCK2.EXE/BUCK3.EXE,
        which the retail DOS install does not contain -- it ships START.EXE + GAME.OVR + BUCK.CFG.
        So the corpus reported `local-install-not-found` for a title sitting on disk, the same class
        of false gap the undocumented GOG Galaxy location caused on 2026-08-14.

        The replacement markers were measured, and the measurement had two halves. MARSCOM, VENUSCOM,
        SHIPS, HITEK and LOTEK appear in **0 of the 10 other DOS installs**, so they identify Buck --
        but the Matrix Cubed archive carries all five as well, so they do NOT tell the two Buck games
        apart. The `.CFG` name is the only file-level discriminator, which is what this pins: strip
        the CFG from either name set and the detector must not confidently answer with the other game.
        """
        shared_buck = {
            "START.EXE", "GAME.OVR", "MARSCOM.DAX", "VENUSCOM.DAX",
            "SHIPS.DAX", "HITEK.DAX", "LOTEK.DAX", "8X8D1.DAX", "ECL1.DAX", "GEO1.DAX",
        }
        self.assert_profile(
            "buck-rogers-countdown-to-doomsday", "BuckRogers1-CountdownToDoomsday",
            shared_buck | {"BUCK.CFG"},
        )
        self.assert_profile(
            "buck-rogers-matrix-cubed", "Matrix",
            shared_buck | {"MATRIX.CFG", "BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "TANDY.ADV"},
        )

        # The null that gives those two their meaning: the shared half alone must not confidently
        # name either game, and must never name the WRONG one. A folder name is not a file, so the
        # neutral folder name here keeps `name_hints` out of it.
        profile_id, _, confidence, _ = inventory.detect_profile(
            Path("unlabelled"), {name.upper() for name in shared_buck}
        )
        self.assertNotEqual(confidence, "high")
        if profile_id is not None:
            self.assertNotIn(profile_id, {"buck-rogers-countdown-to-doomsday", "buck-rogers-matrix-cubed"})

    def test_recursive_inventory_prunes_static_build_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            retail = root / "Retail Game"
            bundled = root / "apps" / "web" / "dist-app" / "assets" / "external" / "Retail Game"
            retail.mkdir(parents=True)
            bundled.mkdir(parents=True)
            folders = inventory.candidate_folders([root], recursive=True, max_depth=8)
            self.assertIn(retail.resolve(), folders)
            self.assertNotIn(bundled.resolve(), folders)

    def test_gen1_binary_discovery_prunes_static_build_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            retail = root / "Retail Game"
            bundled = root / "apps" / "web" / "dist-app" / "Retail Game"
            for folder in (retail, bundled):
                folder.mkdir(parents=True)
                (folder / "GAME.OVR").write_bytes(b"FBOV")
                (folder / "START.EXE").write_bytes(b"MZ")
            self.assertEqual(gen1_map.discover_binary_roots([root]), [retail.resolve()])

    def test_rtlink_discovery_finds_installs_and_prunes_generated_builds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dqk = root / "DQK"
            frua = root / "FRUA"
            bundled = root / "build" / "bundled"
            for folder, filename in ((dqk, "DQK.EXE"), (frua, "CKIT.EXE"), (bundled, "DQK.EXE")):
                folder.mkdir(parents=True)
                (folder / filename).write_bytes(b"MZ")
            self.assertEqual(rtlink_map.discover_rtlink_paths([root]), [
                (dqk / "DQK.EXE").resolve(),
                (frua / "CKIT.EXE").resolve(),
            ])


class DosboxVroommTraceTests(unittest.TestCase):
    def test_snapshot_parser_recovers_split_seek_and_loader_fields(self) -> None:
        text = """EAX=00004200  ESI=00005386  DS=14A0   ES=0C4C
EBX=00000005  EDI=00000824  CS=12C6   EIP=0000028F
ECX=00000003  EBP=00003FFA
EDX=00002235  ESP=00003FD6
12C6:00000291 mov ds,es:[0010] es:[0010]=2116
12C6:00000298 mov cx,es:[0008] es:[0008]=02B2
"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "debugger_console_2.txt"
            path.write_text(text, encoding="utf-8")
            parsed = parse_dosbox_vroomm_trace.parse_snapshot(path)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.seek_offset, 0x32235)
        self.assertEqual(parsed.destination_segment, 0x2116)
        self.assertEqual(parsed.code_size, 0x2B2)

    def test_normalizer_requires_reverse_descriptor_offset_and_size_match(self) -> None:
        profile = {
            "profile_id": "synthetic",
            "title": "Synthetic",
            "fbov": {"file_size": 32, "sha256": "00" * 32},
            "descriptors": [
                {"index": 0, "ovr_file_offset": 8, "code_size": 0x20},
                {"index": 1, "ovr_file_offset": 0x28, "code_size": 0x12},
            ],
        }
        snapshots = [
            parse_dosbox_vroomm_trace.SeekSnapshot(1, 0x4200, 5, 0, 0, 0x1000, 1, 0, None, None),
            parse_dosbox_vroomm_trace.SeekSnapshot(2, 0x4200, 5, 0, 0x28, 0x1000, 2, 0x28, 0x2000, 0x12),
            parse_dosbox_vroomm_trace.SeekSnapshot(3, 0x4200, 5, 0, 8, 0x1000, 2, 8, 0x2002, 0x20),
        ]
        payload = parse_dosbox_vroomm_trace.normalize_trace(snapshots, profile, "test", {})
        self.assertTrue(payload["validation"]["ok"])
        self.assertEqual([record["descriptor_index"] for record in payload["records"]], [1, 0])
        self.assertTrue(payload["records"][1]["contiguous_from_previous"])

    def test_gateway_profile_uses_gateway_targets_not_pool_targets(self) -> None:
        profile = {
            "profile_id": "gateway-to-the-savage-frontier",
            "title": "Gateway",
            "fbov": {"file_size": 347622, "sha256": "00" * 32},
            "descriptors": [
                {"index": 3, "ovr_file_offset": 0x0AB8, "code_size": 0x3F8D},
                {"index": 9, "ovr_file_offset": 0x9471, "code_size": 0x24A7},
            ],
        }
        snapshots = [
            parse_dosbox_vroomm_trace.SeekSnapshot(1, 0x4200, 5, 0, 0, 0x1000, 1, 0, None, None),
            parse_dosbox_vroomm_trace.SeekSnapshot(
                2, 0x4200, 5, 0, 0x9471, 0x1000, 2, 0x9471, 0x3000, 0x24A7
            ),
            parse_dosbox_vroomm_trace.SeekSnapshot(
                3, 0x4200, 5, 0, 0x0AB8, 0x1000, 3, 0x0AB8, 0x324B, 0x3F8D
            ),
        ]

        payload = parse_dosbox_vroomm_trace.normalize_trace(snapshots, profile, "test")

        self.assertTrue(payload["validation"]["ok"])
        names = {target["name"] for target in payload["targets"]}
        self.assertIn("operand_parser_candidate", names)
        self.assertIn("ecl_loader_candidate", names)
        self.assertIn("memory_set_candidate", names)
        self.assertNotIn("combat_handler_candidate", names)

    def test_checked_in_pool_runtime_fixture_preserves_full_trace(self) -> None:
        fixture = json.loads(
            (TOOLS.parent / "docs/engine/research/pool-runtime-overlay-trace.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertTrue(fixture["validation"]["ok"])
        self.assertEqual(fixture["descriptor_count"], 35)
        self.assertEqual(
            [record["descriptor_index"] for record in fixture["records"]], list(range(34, -1, -1))
        )
        resets = [record["descriptor_index"] for record in fixture["records"] if record["contiguous_from_previous"] is False]
        self.assertEqual(resets, [15])


class PoolProtectionPatchTests(unittest.TestCase):
    def test_patch_is_hash_locked_and_changes_only_entry_opcode(self) -> None:
        data = bytearray(patch_pool_protection.PROTECTION_ENTRY_OFFSET + 16)
        data[
            patch_pool_protection.PROTECTION_ENTRY_OFFSET :
            patch_pool_protection.PROTECTION_ENTRY_OFFSET + 3
        ] = patch_pool_protection.EXPECTED_ENTRY
        source = bytes(data)
        patched = patch_pool_protection.patch_overlay(source, patch_pool_protection.sha256(source))
        changed = [index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]]
        self.assertEqual(changed, [patch_pool_protection.PROTECTION_ENTRY_OFFSET])
        self.assertEqual(
            patched[patch_pool_protection.PROTECTION_ENTRY_OFFSET],
            patch_pool_protection.PATCHED_ENTRY[0],
        )

    def test_patch_rejects_unknown_revision(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported GAME.OVR revision"):
            patch_pool_protection.patch_overlay(b"not pool")


class PoolSavePosePatchTests(unittest.TestCase):
    def test_pose_patch_changes_only_three_byte_proven_fields(self) -> None:
        data = bytearray(patch_pool_save_pose.EXPECTED_SIZE)
        for name, value in patch_pool_save_pose.EXPECTED_SOURCE_POSE.items():
            data[patch_pool_save_pose.POSE_OFFSETS[name]] = value
        source = bytes(data)
        patched = patch_pool_save_pose.patch_pose(
            source, 14, 8, "east", patch_pool_save_pose.sha256(source)
        )
        changed = [index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]]
        self.assertEqual(changed, [12801, 12802, 12803])
        self.assertEqual(
            patch_pool_save_pose.decode_pose(patched),
            {"x": 14, "y": 8, "facing": 2},
        )

    def test_pose_patch_rejects_unknown_revision_and_out_of_range_pose(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported SAVGAMA.DAT revision"):
            patch_pool_save_pose.patch_pose(bytes(patch_pool_save_pose.EXPECTED_SIZE), 1, 1, "north")
        data = bytearray(patch_pool_save_pose.EXPECTED_SIZE)
        for name, value in patch_pool_save_pose.EXPECTED_SOURCE_POSE.items():
            data[patch_pool_save_pose.POSE_OFFSETS[name]] = value
        source = bytes(data)
        with self.assertRaisesRegex(ValueError, "0..15"):
            patch_pool_save_pose.patch_pose(source, 16, 1, "north", patch_pool_save_pose.sha256(source))


class PoolEclTransitionPatchTests(unittest.TestCase):
    def test_bootstrap_patch_round_trips_all_blocks_and_one_raw_byte(self) -> None:
        block18 = bytes(range(64))
        block24 = bytearray(256)
        block24[patch_pool_ecl_transition.TABLE_RAW_OFFSET] = patch_pool_ecl_transition.EXPECTED_TARGET
        source = patch_pool_ecl_transition.build_container([(18, block18), (24, bytes(block24))])
        patched = patch_pool_ecl_transition.patch_archive(
            source, patch_pool_ecl_transition.sha256(source)
        )
        self.assertEqual(len(patched), len(source))
        archive_changes = [
            index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]
        ]
        self.assertEqual(len(archive_changes), 1)
        decoded = dict(patch_pool_ecl_transition.decode_blocks(patched))
        self.assertEqual(decoded[18], block18)
        self.assertEqual(decoded[24][patch_pool_ecl_transition.TABLE_RAW_OFFSET], 18)
        changed = [
            index
            for index, pair in enumerate(zip(block24, decoded[24]))
            if pair[0] != pair[1]
        ]
        self.assertEqual(changed, [patch_pool_ecl_transition.TABLE_RAW_OFFSET])

    def test_bootstrap_patch_rejects_unknown_revision(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported ECL1.DAX revision"):
            patch_pool_ecl_transition.patch_archive(b"not pool")


class PoolRouteStatePatchTests(unittest.TestCase):
    def test_pool_area_word_mapping_and_route_patch_are_exact(self) -> None:
        self.assertEqual(patch_pool_route_state.area_offset(0x4900), 0)
        self.assertEqual(patch_pool_route_state.area_offset(0x49F2), 0x1E4)
        self.assertEqual(patch_pool_route_state.area_offset(0x4A35), 0x26A)
        self.assertEqual(patch_pool_route_state.area_offset(0x4A38), 0x270)
        source_bytes = bytearray(patch_pool_route_state.EXPECTED_SIZE)
        last_ecl_offset = patch_pool_route_state.file_offset(0x49F2)
        source_bytes[last_ecl_offset : last_ecl_offset + 2] = (20).to_bytes(2, "little")
        source = bytes(source_bytes)
        patched = patch_pool_route_state.patch_route_state(
            source, patch_pool_route_state.sha256(source)
        )
        self.assertEqual(patch_pool_route_state.read_word(patched, 0x49F2), 18)
        self.assertEqual(patch_pool_route_state.read_word(patched, 0x4A35), 0xFF)
        self.assertEqual(patch_pool_route_state.read_word(patched, 0x4A38), 0)
        changed = [index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]]
        self.assertEqual(changed, [485, 619])

    def test_pool_route_patch_rejects_unknown_revision_and_state(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported coherent Pool save revision"):
            patch_pool_route_state.patch_route_state(bytes(patch_pool_route_state.EXPECTED_SIZE))
        source = bytearray(patch_pool_route_state.EXPECTED_SIZE)
        last_ecl_offset = patch_pool_route_state.file_offset(0x49F2)
        source[last_ecl_offset : last_ecl_offset + 2] = (20).to_bytes(2, "little")
        source[patch_pool_route_state.file_offset(0x4A38)] = 2
        with self.assertRaisesRegex(ValueError, "route-state source mismatch"):
            patch_pool_route_state.patch_route_state(
                bytes(source), patch_pool_route_state.sha256(bytes(source))
            )

    def test_pool_game_area_patch_changes_both_serialized_selectors(self) -> None:
        source = bytearray(patch_pool_game_area.EXPECTED_SIZE)
        for offset in patch_pool_game_area.GAME_AREA_OFFSETS:
            source[offset] = 2
        source_bytes = bytes(source)
        patched = patch_pool_game_area.patch_game_area(
            source_bytes, patch_pool_game_area.sha256(source_bytes)
        )
        changed = [
            index
            for index, pair in enumerate(zip(source_bytes, patched))
            if pair[0] != pair[1]
        ]
        self.assertEqual(changed, [0, 3621])
        self.assertEqual([patched[offset] for offset in changed], [1, 1])

    def test_pool_manual_save_inspector_reports_adjacent_ecl2_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            data = bytearray(inspect_pool_save.EXPECTED_SIZE)
            values = {
                "wrapper_game_area": 2,
                "area2_game_area": 2,
                "ecl_member": 20,
                "x": 14,
                "y": 10,
                "facing": 6,
            }
            for name, value in values.items():
                data[inspect_pool_save.OFFSETS[name]] = value
            data[100:117] = b"CHRDATG1 CHRDATG2"
            save = directory / "SAVGAMG.DAT"
            save.write_bytes(data)
            (directory / "CHRDATG1.SAV").write_bytes(b"one")
            (directory / "CHRDATG2.SAV").write_bytes(b"two")

            report = inspect_pool_save.inspect_save(save)

            self.assertTrue(report["ecl2_descriptor3_adjacent_candidate"])
            self.assertEqual(report["host"]["ecl_member"], 20)
            self.assertEqual(report["pose"]["facing_name"], "west")
            self.assertEqual(report["sidecars"]["missing_characters"], [])

    def test_pool_sidecars_clone_complete_sparse_character_set(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as target_temp:
            source_dir = Path(source_temp)
            target_dir = Path(target_temp)
            source_save = source_dir / "SAVGAMH.DAT"
            target_save = target_dir / "SAVGAMG.DAT"
            source_save.write_bytes(b"CHRDATH1 CHRDATH2")
            target_save.write_bytes(b"CHRDATH1 CHRDATH2")
            fixtures = {
                "CHRDATH1.SAV": b"char1",
                "CHRDATH1.ITM": b"items1",
                "CHRDATH1.SPC": b"spells1",
                "CHRDATH2.SAV": b"char2",
                "CHRDATH2.ITM": b"items2",
            }
            for name, data in fixtures.items():
                (source_dir / name).write_bytes(data)

            manifest = clone_pool_save_sidecars.clone_sidecars(source_save, target_save)

            self.assertEqual(len(manifest["sidecars"]), len(fixtures))
            for source_name, data in fixtures.items():
                self.assertEqual((target_dir / source_name).read_bytes(), data)
            self.assertTrue((target_dir / "SAVGAMG.DAT.sidecars.json").is_file())

    def test_pool_sidecars_reject_missing_source_and_existing_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source_save = root / "SAVGAMH.DAT"
            target_save = root / "SAVGAMG.DAT"
            source_save.write_bytes(b"CHRDATH1")
            target_save.write_bytes(b"CHRDATH1")
            with self.assertRaisesRegex(FileNotFoundError, "no CHRDATH sidecars"):
                clone_pool_save_sidecars.clone_sidecars(source_save, target_save)
            (root / "CHRDATH1.SAV").write_bytes(b"source-char")
            (root / "CHRDATH1.SAV").write_bytes(b"existing-char")
            with self.assertRaisesRegex(FileExistsError, "target sidecar already exists"):
                clone_pool_save_sidecars.clone_sidecars(source_save, target_save)

    def test_pool_sidecars_reject_embedded_slot_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as target_temp:
            source_save = Path(source_temp) / "SAVGAMH.DAT"
            target_save = Path(target_temp) / "SAVGAMG.DAT"
            source_save.write_bytes(b"CHRDATH1")
            target_save.write_bytes(b"CHRDATG1")
            (source_save.parent / "CHRDATH1.SAV").write_bytes(b"char")
            with self.assertRaisesRegex(ValueError, "references CHRDATG, not source slot H"):
                clone_pool_save_sidecars.clone_sidecars(source_save, target_save)

    def test_pool_route_breakpoint_fixture_rejects_stale_overlay_identity(self) -> None:
        fixture_path = (
            TOOLS.parent
            / "docs"
            / "engine"
            / "research"
            / "pool-runtime-breakpoint-rejection.json"
        )
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        def physical(cs_ip: str) -> int:
            segment, offset = (int(part, 16) for part in cs_ip.split(":"))
            return segment * 16 + offset

        requested = physical(fixture["breakpoint"]["requested_cs_ip"])
        observed = physical(fixture["breakpoint"]["observed_cs_ip"])
        self.assertEqual(requested, observed)
        self.assertEqual(requested, fixture["breakpoint"]["physical_address"])
        retail = bytes.fromhex(fixture["startup_candidate"]["expected_bytes_hex"])
        resident = bytes.fromhex(fixture["resident_at_hit"]["bytes_hex"])
        self.assertNotEqual(resident, retail[: len(resident)])
        self.assertEqual(fixture["verdict"], "rejected_stale_overlay_placement")

    def test_pool_route_overlay_fixture_preserves_claim_boundary(self) -> None:
        fixture_path = (
            TOOLS.parent
            / "docs"
            / "engine"
            / "research"
            / "pool-runtime-route-overlay-trace.json"
        )
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        self.assertTrue(fixture["validation"]["ok"])
        self.assertEqual(
            fixture["descriptor_sequence"],
            [20, 28, 7, 24, 8, 10, 31, 13, 32, 9, 25, 22, 19, 30, 12, 34],
        )
        self.assertTrue(fixture["route"]["combat_was_forced"])
        self.assertEqual(
            fixture["route"]["handoff_kind"],
            "generic_random_encounter_not_bound_to_ecl_combat",
        )
        self.assertEqual(
            fixture["rejected_startup_candidate"]["route_time_reload_count"], 0
        )
        self.assertNotIn(3, fixture["descriptor_sequence"])
        self.assertIn("does not prove execution", fixture["claim_boundary"])

    def test_pool_ecl_cursor_fixture_rejects_random_handoff_as_ecl_combat(self) -> None:
        fixture_path = (
            TOOLS.parent
            / "docs"
            / "engine"
            / "research"
            / "pool-runtime-ecl-cursor-trace.json"
        )
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        self.assertTrue(fixture["validation"]["ok"])
        self.assertEqual(fixture["cursor_count"], 62)
        self.assertEqual(fixture["parser"]["runtime_cs_ip"], "30CF:0000")
        self.assertEqual(fixture["parser"]["dgroup_cursor_offset"], 0x49ED)
        self.assertFalse(fixture["targets"]["reached_search_location_range"])
        self.assertFalse(fixture["targets"]["reached_combat"])
        self.assertLess(fixture["cursor_max"], 0x9AB7)
        self.assertEqual(
            fixture["verdict"], "reentry_did_not_dispatch_selected_search_location"
        )

    def test_pool_ecl_cursor_address_conversion_matches_known_initial_entry(self) -> None:
        self.assertEqual(parse_pool_ecl_cursor_trace.virtual_address(0x75), 0x9973)

    def test_pool_ecl_host_fixture_identifies_stale_ecl2_member_20(self) -> None:
        fixture_path = (
            TOOLS.parent
            / "docs"
            / "engine"
            / "research"
            / "pool-runtime-ecl-host-selector.json"
        )
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        runtime = fixture["runtime"]
        retail = fixture["retail_match"]
        self.assertEqual(runtime["archive_set"], 2)
        self.assertEqual(runtime["requested_member"], 18)
        self.assertEqual(runtime["first_parser_virtual_address"], 0x9973)
        self.assertEqual(retail["loaded_header_archive_set"], 2)
        self.assertEqual(retail["loaded_header_member"], 20)
        self.assertFalse(retail["requested_pair_exists"])
        self.assertTrue(retail["target_pair_exists"])
        self.assertEqual(
            fixture["verdict"],
            "game_area_2_member_18_lookup_retains_stale_ecl2_member_20",
        )

    def test_pool_route_phase_ranges_reject_incomplete_metadata(self) -> None:
        metadata = {
            "seek_count": 2,
            "phase_seek_counts": {"entry": 1},
        }
        with self.assertRaisesRegex(ValueError, "cover 1 snapshots, expected 2"):
            parse_pool_route_vroomm_trace.canonical_ranges(metadata)


class SecretRouteSavePatchTests(unittest.TestCase):
    def test_secret_route_probe_patches_only_declared_host_fields(self) -> None:
        source = bytearray(patch_secret_route_save.EXPECTED_SIZE)
        source[0] = 1
        source[patch_secret_route_save.AREA1_OFFSET + 0x1CC] = 1
        source[patch_secret_route_save.AREA2_OFFSET + 0x624] = 1
        source_bytes = bytes(source)

        patched = patch_secret_route_save.patch_route_save(
            source_bytes, patch_secret_route_save.sha256(source_bytes)
        )

        changed = [index for index, pair in enumerate(zip(source_bytes, patched)) if pair[0] != pair[1]]
        declared = set(patch_secret_route_save.BYTE_PATCHES)
        declared.update(
            offset + byte_index
            for offset, value in patch_secret_route_save.WORD_PATCHES.items()
            for byte_index, byte in enumerate(value.to_bytes(2, "little"))
            if source_bytes[offset + byte_index] != byte
        )
        self.assertEqual(changed, sorted(offset for offset in declared if source_bytes[offset] != patched[offset]))
        self.assertEqual(patched[0], 3)
        self.assertEqual(patched[395], 97)
        self.assertEqual(int.from_bytes(patched[485:487], "little"), 97)
        self.assertEqual(patched[5121:5124], bytes((13, 3, 6)))
        self.assertEqual(patched[1024:1027], bytes((0, 0, 0)))

        diagnostic = patch_secret_route_save.patch_route_save(
            source_bytes,
            patch_secret_route_save.sha256(source_bytes),
            keep_wrapper_game_area=True,
        )
        self.assertEqual(diagnostic[0], source_bytes[0])
        self.assertEqual(diagnostic[5121:5124], bytes((13, 3, 6)))

    def test_secret_route_probe_rejects_unknown_revision(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported Secret save"):
            patch_secret_route_save.patch_route_save(bytes(patch_secret_route_save.EXPECTED_SIZE))


class CorpusContractTests(unittest.TestCase):
    def test_decompiler_manifest_preserves_resolved_and_unresolved_gen1_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            loader = bytearray(128)
            loader[:2] = b"MZ"
            loader[2:10] = bytes.fromhex("80 00 01 00 00 00 02 00")
            loader[0x14:0x18] = bytes.fromhex("04 00 00 00")
            overlay = bytes(8) + bytes(16)
            loader_path = root / "START.EXE"
            overlay_path = root / "GAME.OVR"
            loader_path.write_bytes(loader)
            overlay_path.write_bytes(overlay)
            layout = {
                "profile_id": "synthetic",
                "title": "Synthetic",
                "loader_path": str(loader_path),
                "overlay_path": str(overlay_path),
                "descriptors": [
                    {
                        "index": 0,
                        "loader_file_offset": 40,
                        "ovr_file_offset": 8,
                        "code_size": 16,
                        "fixup_file_offset": 24,
                        "fixup_size": 0,
                        "stub_array_file_offset": 56,
                        "stub_count": 1,
                        "fixup_format_status": "u16_code_relative_offsets",
                        "fixup_entries": [
                            {
                                "code_offset": 3,
                                "instruction_offset": 0,
                                "context": "lcall_segment",
                                "original_segment": 0x20,
                                "call_target_offset": 5,
                                "route_kind": "public_stub_owned",
                                "target_descriptor_index": 0,
                                "target_proc_offset": 5,
                            },
                            {
                                "code_offset": 9,
                                "instruction_offset": 6,
                                "context": "lcall_segment",
                                "original_segment": 0x99,
                                "call_target_offset": 7,
                                "route_kind": "unresolved_relocated_segment",
                                "target_descriptor_index": None,
                                "target_proc_offset": None,
                            },
                        ],
                    }
                ],
            }
            package = export_decompiler_inputs.gen1_package(layout)
        self.assertEqual(export_decompiler_inputs.validate_package(package), [])
        self.assertEqual(package["entry_point"]["block_offset"], 4)
        self.assertEqual([row["route_status"] for row in package["calls"]], ["public_stub_owned", "unresolved_relocated_segment"])
        self.assertIsNotNone(package["calls"][0]["target_synthetic_address"])
        self.assertIsNone(package["calls"][1]["target_synthetic_address"])
        self.assertNotIn(str(root), json.dumps(package))
        tables = export_decompiler_inputs.package_csv(package)
        self.assertEqual(set(tables), {"segments.csv", "relocations.csv", "calls.csv", "symbols.csv", "candidate-symbols.csv", "signature-seeds.csv"})
        self.assertIn("ovr000,ovr000,vroomm-overlay-code", tables["segments.csv"])
        self.assertIn("unresolved_relocated_segment", tables["calls.csv"])
        self.assertNotIn(str(root), "".join(tables.values()))

    def test_decompiler_symbols_are_scoped_to_same_game_coab_retail_offsets(self) -> None:
        descriptors = [{"index": 0, "ovr_file_offset": 8, "code_size": 16}]
        blocks = {"ovr000": {"synthetic_address": export_decompiler_inputs.block_address(1)}}
        oracle = {
            "profile_id": "curse-of-the-azure-bonds",
            "functions": [{
                "retail_file_offset": 10,
                "canonical_candidate": "battle_setup",
                "symbol": "battle_begins",
                "unit": 1,
                "unit_offset": 2,
                "evidence_status": "same_game_oracle_retail_offset",
                "borland_prologue": True,
            }],
        }
        symbols = export_decompiler_inputs.coab_symbols(
            "curse-of-the-azure-bonds", descriptors, blocks, oracle
        )
        self.assertEqual(symbols[0]["name"], "coab_ovr001_battle_setup")
        self.assertEqual(symbols[0]["oracle_scope"], "same-game-only")
        self.assertEqual(export_decompiler_inputs.coab_symbols("pool-of-radiance", descriptors, blocks, oracle), [])

    def test_decompiler_runtime_candidates_remain_explicitly_nonsemantic(self) -> None:
        descriptors = [{"index": 26, "ovr_file_offset": 100, "code_size": 200}]
        blocks = {"ovr026": {"synthetic_address": export_decompiler_inputs.block_address(27)}}
        report = {
            "profile_id": "secret-of-the-silver-blades",
            "strict_status": "pass",
            "claim_boundary": "Pending exact title-local CS:IP hit.",
            "symbols": [{
                "candidate_name": "count_combat_teams",
                "semantic_status": "candidate_pending_secret_cs_ip_hit",
                "descriptor_index": 26,
                "descriptor_relative_offset": 20,
                "retail_file_offset": 120,
                "size": 84,
                "evidence": ["exact retail bytes"],
            }],
        }
        candidates = export_decompiler_inputs.runtime_candidate_symbols(
            "secret-of-the-silver-blades", descriptors, blocks, report
        )
        self.assertEqual(candidates[0]["name"], "candidate_secret_of_the_silver_blades_count_combat_teams")
        self.assertEqual(candidates[0]["synthetic_address"], blocks["ovr026"]["synthetic_address"] + 20)
        self.assertEqual(candidates[0]["status"], "candidate")
        self.assertEqual(
            export_decompiler_inputs.runtime_candidate_symbols("pool-of-radiance", descriptors, blocks, report),
            [],
        )

    def test_gateway_runtime_candidates_use_the_same_nonsemantic_channel(self) -> None:
        descriptors = [{"index": 9, "ovr_file_offset": 0x9471, "code_size": 0x24A7}]
        blocks = {"ovr009": {"synthetic_address": export_decompiler_inputs.block_address(10)}}
        report = {
            "profile_id": "gateway-to-the-savage-frontier",
            "strict_status": "pass",
            "claim_boundary": "Pending exact Gateway runtime hit.",
            "symbols": [{
                "candidate_name": "ecl_loader",
                "semantic_status": "candidate_pending_gateway_runtime_hit",
                "descriptor_index": 9,
                "descriptor_relative_offset": 0x38F,
                "retail_file_offset": 0x9800,
                "size": 222,
                "evidence": ["exact retail descriptor ownership"],
            }],
        }

        candidates = export_decompiler_inputs.runtime_candidate_symbols(
            "gateway-to-the-savage-frontier", descriptors, blocks, report
        )

        self.assertEqual(candidates[0]["name"], "candidate_gateway_to_the_savage_frontier_ecl_loader")
        self.assertEqual(candidates[0]["block_offset"], 0x38F)
        self.assertEqual(candidates[0]["status"], "candidate")

    def test_decompiler_gen2_manifest_expands_exact_mz_relocations_and_stubs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "DQK.EXE"
            data = bytearray(200)
            data[:2] = b"MZ"
            data[36:38] = bytes.fromhex("34 12")
            data[28:32] = bytes.fromhex("04 00 00 00")
            path.write_bytes(data)
            mapped = {
                "path": str(path),
                "sha256": export_decompiler_inputs.sha256_bytes(data),
                "mz": {
                    "header_bytes": 32,
                    "image_bytes": 128,
                    "relocation_count": 1,
                    "relocation_table": 28,
                    "entry_cs": 0,
                    "entry_ip": 4,
                },
                "overlays": [{
                    "index": 0,
                    "code_start": 140,
                    "code_size": 16,
                    "file_offset": 128,
                    "blob_size": 72,
                    "prefix_source": "dqk_verified",
                    "table_file_offset": 100,
                    "runtime_seg": 0x1F4E,
                }],
                "stubs": [{
                    "file_offset": 48,
                    "ljmp_off": 2,
                    "ljmp_seg": 0x1F4E,
                    "overlay_index": 0,
                    "target_overlay_index": 0,
                    "target_file_offset": 142,
                    "target_status": "resolved",
                }],
            }
            package = export_decompiler_inputs.gen2_package(mapped)
        self.assertEqual(export_decompiler_inputs.validate_package(package), [])
        self.assertEqual(package["relocations"][0]["original_value"], 0x1234)
        self.assertEqual(package["calls"][0]["target_block_offset"], 2)
        self.assertFalse(package["address_model"]["runtime_address_claim"])

    def test_decompiler_signature_seed_policy_rejects_weak_and_structural_candidates(self) -> None:
        eligible, reason = export_decompiler_inputs.signature_eligible({
            "match_kind": "relocation-normalized", "confidence": "high", "size": 18,
            "instruction_count": 8,
        })
        self.assertTrue(eligible)
        self.assertEqual(reason, "eligible-relocation-normalized")
        for row, expected in [
            ({"match_kind": "exact", "confidence": "low", "size": 20, "instruction_count": 8}, "exact-low-confidence"),
            ({"match_kind": "relocation-normalized", "confidence": "medium", "size": 20, "instruction_count": 8}, "normalized-not-high-confidence"),
            ({"match_kind": "control-flow-shape", "confidence": "high", "size": 30, "instruction_count": 12}, "structural-only-rejected"),
        ]:
            self.assertEqual(export_decompiler_inputs.signature_eligible(row), (False, expected))

    def test_decompiler_signature_pattern_masks_instruction_variants(self) -> None:
        raw = bytes.fromhex("55 89 e5 b8 34 12 8b 46 04 c3")
        variants = export_decompiler_inputs.signature_variant_offsets(raw)
        pattern = export_decompiler_inputs.signature_pattern(raw, variants)
        self.assertEqual(variants, [4, 5, 8])
        self.assertEqual(pattern, "5589E5B8....8B46..C3")
    def test_immediate_instruction_encoding_matches_gen1_ecl_frame(self) -> None:
        self.assertEqual(
            goldbox_corpus.immediate_instruction(0x21, [34, 2, 255]),
            bytes([0x21, 0, 34, 0, 2, 0, 255]),
        )

    def test_route_declarations_separate_raw_and_resolved_piece_ids(self) -> None:
        routes = goldbox_corpus.load_routes()
        self.assertEqual(routes["champions-of-krynn"]["load_pieces"], [3, 4, 23])
        self.assertEqual(routes["champions-of-krynn"]["resolved_wall_blocks"], [3, 255, 23])
        secret = routes["secret-of-the-silver-blades"]
        self.assertEqual(secret["load_pieces"], [13, 14, 127])
        self.assertEqual(secret["resolved_wall_blocks"], [13, 255, 127])
        self.assertEqual(secret["natural_encounter"]["cell"], {"x": 12, "y": 3, "descriptor": 0x83})
        self.assertEqual(secret["natural_encounter"]["combat_vaddr"], 0x82BB)
        self.assertEqual(secret["natural_encounter"]["resume_vaddr"], 0x82BC)
        self.assertEqual(secret["persistence"]["memory_address"], 0x4CCD)
        self.assertEqual(secret["persistence"]["consumed_mask"], 0x04)

    def test_treasures_records_two_wave_persistent_contract(self) -> None:
        route = goldbox_corpus.load_routes()["treasures-of-the-savage-frontier"]
        self.assertEqual(route["surface"], "natural-combat")
        self.assertEqual(route["natural_encounter"]["cell"], {"x": 7, "y": 7, "descriptor": 0xFF})
        self.assertEqual(
            [wave["combat_vaddr"] for wave in route["natural_encounter"]["waves"]],
            [0x8CE8, 0x8DED],
        )
        self.assertEqual(
            route["persistence"]["guards"],
            [
                {"vaddr": 0x8DF9, "address": 0x022D, "value": 1},
                {"vaddr": 0x8DFF, "address": 0x0232, "value": 1},
            ],
        )
        self.assertEqual(
            goldbox_corpus.save_instruction(1, 0x022D),
            bytes.fromhex("09 00 01 01 2d 02"),
        )

        claims = json.loads(goldbox_corpus.SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        claim = next(game for game in claims["games"] if game["profile_id"] == route["profile_id"])
        self.assertEqual(claim["web_level"], "campaign")
        self.assertIn("[0x022D]=1", claim["web_text"])
        self.assertIn("[0x0232]=1", claim["web_text"])
        self.assertIn("save/restart/load", claim["web_text"])
        self.assertNotIn("wave-two victory", claim["missing"])
        self.assertNotIn("save/restart/load proof", claim["missing"])
        self.assertNotIn("selected-folder release acceptance", claim["missing"])
        for retained_gap in ("Original-DOS", "ZOUNDS", "full retail rosters", "AD&D 2e"):
            self.assertIn(retained_gap, claim["missing"])

        # "six-leg campaign" was in the tuple above until 2026-08-18, and by then it was pinning a
        # falsehood: the matrix records all six of Treasures' legs `proven`, so a `missing` string
        # saying the six-leg matrix is absent contradicts it -- and this assertion REQUIRED the
        # contradiction, so correcting the JSON turned the gate red. Derive the expectation from the
        # matrix instead of hardcoding the English, so the next drift in either direction is caught.
        matrix_entry = goldbox_corpus.load_campaign_matrix()[route["profile_id"]]
        if matrix_entry["satisfied"]:
            self.assertNotIn("six-leg campaign", claim["missing"])
            self.assertNotIn("broad town/wilderness/choice coverage", claim["missing"])
        else:
            self.assertIn("six-leg campaign", claim["missing"])

        capabilities = goldbox_corpus.validate_capability_contract(
            goldbox_corpus.load_capabilities()["treasures-of-the-savage-frontier"]
        )
        self.assertEqual(capabilities["status"], "verified-contract")
        self.assertTrue(all(capabilities["checks"].values()))
        self.assertNotIn("verification", route)
        self.assertEqual(goldbox_corpus.verify_release_contract(route)["status"], "missing")
        game = {
            "route": {"status": "verified-byte-contract", "surface": "natural-combat", "persistence": {"status": "verified-contract"}},
            "manifest": {"status": "complete-local"},
            "binary": {"status": "binary_mapped"},
            "capabilities": capabilities,
        }
        self.assertEqual(goldbox_corpus.evidence_level(game), "persistent")

    def test_treasures_capability_ledger_rejects_incomplete_or_unknown_claims(self) -> None:
        original = goldbox_corpus.load_capabilities()["treasures-of-the-savage-frontier"]
        mutations = []
        missing_towns = json.loads(json.dumps(original))
        del missing_towns["capabilities"]["towns"]
        mutations.append((missing_towns, "all_areas_declared"))
        missing_ruleset_gaps = json.loads(json.dumps(original))
        del missing_ruleset_gaps["capabilities"]["ruleset"]["gaps"]
        mutations.append((missing_ruleset_gaps, "area_ruleset"))
        missing_import_evidence = json.loads(json.dumps(original))
        del missing_import_evidence["capabilities"]["retail_save"]["import"]["evidence"]
        mutations.append((missing_import_evidence, "retail_save_import"))
        missing_export_gaps = json.loads(json.dumps(original))
        del missing_export_gaps["capabilities"]["retail_save"]["export"]["gaps"]
        mutations.append((missing_export_gaps, "retail_save_export"))
        unknown_status = json.loads(json.dumps(original))
        unknown_status["capabilities"]["audio"]["status"] = "complete-ish"
        mutations.append((unknown_status, "area_audio"))

        for mutation, failed_check in mutations:
            with self.subTest(failed_check=failed_check):
                result = goldbox_corpus.validate_capability_contract(mutation)
                self.assertEqual(result["status"], "failed-checks")
                self.assertIn(failed_check, result["failed_checks"])

    def test_pools_records_chained_member_persistent_contract(self) -> None:
        route = goldbox_corpus.load_routes()["pools-of-darkness"]
        self.assertEqual(route["surface"], "natural-combat")
        self.assertEqual(route["natural_encounter"]["ecl_block"], 72)
        self.assertEqual(route["natural_encounter"]["cell"], {"x": 8, "y": 6, "descriptor": 0x97})
        self.assertEqual(route["natural_encounter"]["combat_vaddr"], 0x9885)
        self.assertEqual(route["natural_encounter"]["resume_vaddr"], 0x9886)
        self.assertEqual(
            route["natural_encounter"]["chain"],
            {
                "source_ecl_block": 69,
                "selector_save_vaddr": 0x9985,
                "selector_address": 0x027B,
                "selector_value": 38,
                "new_ecl_vaddr": 0x9D8C,
                "target_ecl_block": 72,
            },
        )
        self.assertEqual(
            route["persistence"]["guards"],
            [{"ecl_block": 69, "vaddr": 0x9BEC, "address": 0x0278, "value": 1}],
        )

        claims = json.loads(goldbox_corpus.SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        claim = next(game for game in claims["games"] if game["profile_id"] == route["profile_id"])
        self.assertEqual(claim["web_level"], "campaign")
        self.assertIn("[0x0278]=1", claim["web_text"])
        self.assertIn("save/restart/load", claim["web_text"])
        self.assertNotIn("outcome persistence", claim["web_text"])
        self.assertNotIn("save/restart/load proof", claim["missing"])

    def test_pools_cross_member_verifier_rejects_bad_chain_when_installed(self) -> None:
        root = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness")
        if not (root / "ECL1.DAX").exists():
            self.skipTest("Pools retail install not present")
        files = {path.name.upper(): path for path in root.iterdir() if path.is_file()}
        route = goldbox_corpus.load_routes()["pools-of-darkness"]
        verified = goldbox_corpus.verify_dax_gen1_route(route, files)
        self.assertTrue(verified["checks"]["natural_chain_selector_save"])
        self.assertTrue(verified["checks"]["natural_chain_new_ecl"])

        bad_selector = json.loads(json.dumps(route))
        bad_selector["natural_encounter"]["chain"]["selector_save_vaddr"] += 1
        selector_result = goldbox_corpus.verify_dax_gen1_route(bad_selector, files)
        self.assertFalse(selector_result["checks"]["natural_chain_selector_save"])

        bad_chain = json.loads(json.dumps(route))
        bad_chain["natural_encounter"]["chain"]["new_ecl_vaddr"] += 1
        chain_result = goldbox_corpus.verify_dax_gen1_route(bad_chain, files)
        self.assertFalse(chain_result["checks"]["natural_chain_new_ecl"])

    def test_frua_heirs_records_retail_playable_route(self) -> None:
        route = goldbox_corpus.load_routes()["forgotten-realms-unlimited-adventures"]
        self.assertEqual(route["container_kind"], "frua-dsn")
        self.assertEqual(route["design_dir"], "HEIRS.DSN")
        self.assertEqual(route["module_number"], 17)
        self.assertEqual(route["entry"], {"slot": 0, "x": 1, "y": 0, "facing_code": 2, "facing": "east"})
        self.assertEqual(route["target"], {"x": 1, "y": 1})
        self.assertEqual(route["event_slot"], 41)
        self.assertEqual(
            route["event_text"],
            "THE ODOR AND PHYSICAL EVIDENCE SUGGEST THAT THIS CAVE IS THE DEN OF SOME ILL-BRED FLYING CREATURES. ",
        )
        question = route["question_button"]
        self.assertEqual(question["geo_file"], "GEO001.DAT")
        self.assertEqual(question["module_number"], 1)
        self.assertEqual(question["entry"], {"slot": 0, "x": 7, "y": 13, "facing_code": 4, "facing": "south"})
        self.assertEqual(question["target"], {"x": 9, "y": 13})
        self.assertEqual(question["route_actions"], ["left", "forward", "forward"])
        self.assertEqual(question["event_slot"], 11)
        self.assertEqual(question["event_type"], 10)
        self.assertTrue(question["once_only"])
        self.assertEqual(question["labels"], ["HELP THEM", "SLINK AWAY", "GO FOR HELP", "YELL"])
        self.assertEqual(question["branch_targets"], [12, 13, 15, 16, 0])
        self.assertEqual(question["repeat_question_buttons"], [4])
        self.assertEqual(question["backup_one_step_buttons"], [])
        self.assertEqual(
            [(target["slot"], target["event_type"], target["once_only"]) for target in question["button_targets"]],
            [(12, 1, True), (13, 2, True), (15, 2, True), (16, 2, False)],
        )
        persistence = route["persistence"]
        self.assertEqual(persistence["save_version"], 2)
        self.assertEqual(persistence["module_event_state_version"], 1)
        self.assertEqual(persistence["module_id"], "HEIRS.DSN")
        self.assertEqual(persistence["consumed_event_ids"], [11, 13])
        # The markers must be the LIVE case labels, not prose about them: goldbox_corpus.py's
        # persistence_browser_test/persistence_electron_test checks pass only when the declared
        # string is literally present in the declared test file. Asserting the exact label (rather
        # than a "once-only/repeat/persistent" substring, which no case has been called since the
        # FRUA cases were renamed) is what keeps this declaration from silently drifting out of
        # sync again and reporting a false failed-checks on the next regeneration. The contract
        # itself stays pinned by the generator's own snapshot_markers, which independently require
        # `moduleId: 'HEIRS.DSN'` and `consumedEventIds: [11, 13]` inside those same files.
        self.assertEqual(
            persistence["browser_marker"],
            "FRUA: UA-root HEIRS Caravan combat + exact reward/continuation/persistence",
        )
        self.assertEqual(
            persistence["electron_marker"],
            "Electron shell: UA-root HEIRS combat + exact Caravan reward/continuation/persistence",
        )
        browser_test = goldbox_corpus.REPO_ROOT / persistence["browser_test"]
        electron_test = goldbox_corpus.REPO_ROOT / persistence["electron_test"]
        self.assertIn(persistence["browser_marker"], browser_test.read_text(encoding="utf-8"))
        self.assertIn(persistence["electron_marker"], electron_test.read_text(encoding="utf-8"))

        claims = json.loads(goldbox_corpus.SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        claim = next(game for game in claims["games"] if game["profile_id"] == route["profile_id"])
        self.assertEqual(claim["web_level"], "persistent")
        self.assertIn("26 playable maps", claim["web_text"])
        self.assertIn(route["event_text"].rstrip(), claim["web_text"])

    def test_frua_heirs_verifier_rejects_corrupted_contract_when_installed(self) -> None:
        root = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures")
        if not (root / "HEIRS.DSN" / "GEO017.DAT").exists() or not (root / "HEIRS.DSN" / "GEO001.DAT").exists():
            self.skipTest("FRUA HEIRS retail install not present")
        files = {"CKIT.EXE": root / "CKIT.EXE"}
        route = goldbox_corpus.load_routes()["forgotten-realms-unlimited-adventures"]
        verified = goldbox_corpus.verify_frua_dsn_route(route, files)
        self.assertEqual(verified["status"], "verified-byte-contract")
        self.assertEqual(verified["decoded_event_text"], route["event_text"])
        self.assertEqual(verified["entry"], route["entry"])
        self.assertEqual(verified["target"], route["target"])
        self.assertEqual(verified["event_slot"], route["event_slot"])
        self.assertEqual(verified["event_text"], route["event_text"])
        question = verified["question_button"]
        self.assertEqual(question["status"], "verified-byte-contract")
        self.assertEqual(question["entry"], route["question_button"]["entry"])
        self.assertEqual(question["target"], route["question_button"]["target"])
        self.assertEqual(question["event_slot"], 11)
        self.assertEqual(question["event_type"], 10)
        self.assertTrue(question["once_only"])
        self.assertEqual(question["decoded_prompt"], route["question_button"]["prompt"])
        self.assertEqual(question["decoded_labels"], ["HELP THEM", "SLINK AWAY", "GO FOR HELP", "YELL"])
        self.assertEqual(question["branch_targets"], [12, 13, 15, 16, 0])
        self.assertEqual(question["repeat_question_buttons"], [4])
        self.assertEqual(question["backup_one_step_buttons"], [])
        self.assertTrue(question["no_art"])
        self.assertEqual(question["button_targets"], route["question_button"]["button_targets"])
        self.assertEqual(verified["persistence"]["status"], "verified-contract")
        self.assertEqual(
            verified["persistence"]["engine_test"],
            route["persistence"]["engine_test"],
        )
        self.assertTrue(all(verified["persistence"]["checks"].values()))
        self.assertEqual(
            goldbox_corpus.evidence_level({
                "route": verified,
                "manifest": {"status": "missing"},
                "binary": {"status": "binary_mapped"},
            }),
            "persistent",
        )

        bad_hash = json.loads(json.dumps(route))
        bad_hash["geo_sha256"] = "00" * 32
        self.assertFalse(goldbox_corpus.verify_frua_dsn_route(bad_hash, files)["checks"]["frua_geo_hash"])

        bad_event = json.loads(json.dumps(route))
        bad_event["event_text"] = "NOT THE RETAIL EVENT"
        self.assertFalse(goldbox_corpus.verify_frua_dsn_route(bad_event, files)["checks"]["frua_event_text"])

        bad_question_hash = json.loads(json.dumps(route))
        bad_question_hash["question_button"]["geo_sha256"] = "00" * 32
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_question_hash, files)["checks"]["frua_question_geo_hash"]
        )

        bad_question_record = json.loads(json.dumps(route))
        bad_question_record["question_button"]["event_record_hex"] = "00" * 20
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_question_record, files)["checks"]["frua_question_event_record"]
        )

        bad_repeat = json.loads(json.dumps(route))
        bad_repeat["question_button"]["repeat_question_buttons"] = [1]
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_repeat, files)["checks"]["frua_question_repeat_buttons"]
        )

        bad_yell = json.loads(json.dumps(route))
        bad_yell["question_button"]["button_targets"][3]["text"] = "NOT THE RETAIL YELL TARGET"
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_yell, files)["checks"]["frua_question_button_4_target"]
        )

        bad_state_version = json.loads(json.dumps(route))
        bad_state_version["persistence"]["module_event_state_version"] = 99
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_state_version, files)["checks"]["persistence_event_state_schema"]
        )

        bad_browser_marker = json.loads(json.dumps(route))
        bad_browser_marker["persistence"]["browser_marker"] = "missing-frua-persistence-marker"
        self.assertFalse(
            goldbox_corpus.verify_frua_dsn_route(bad_browser_marker, files)["checks"]["persistence_browser_test"]
        )

    def test_persistent_level_requires_verified_persistence_contract(self) -> None:
        game = {
            "route": {
                "status": "verified-byte-contract",
                "surface": "natural-combat",
                "persistence": {"status": "verified-contract"},
            },
            "manifest": {"status": "complete-local"},
            "binary": {"status": "binary_mapped"},
        }
        self.assertEqual(goldbox_corpus.evidence_level(game), "persistent")
        game["route"]["persistence"]["status"] = "failed-checks"
        self.assertEqual(goldbox_corpus.evidence_level(game), "combat")

    def test_campaign_level_requires_full_matrix_pass_on_top_of_persistent(self) -> None:
        game = {
            "route": {
                "status": "verified-byte-contract",
                "surface": "natural-combat",
                "persistence": {"status": "verified-contract"},
            },
            "manifest": {"status": "complete-local"},
            "binary": {"status": "binary_mapped"},
        }
        # No campaign_matrix attached at all: stays at persistent, matching every pre-existing
        # game dict shape in this test module (this is the un-migrated-caller safety net).
        self.assertEqual(goldbox_corpus.evidence_level(game), "persistent")
        # A matrix with a blocked leg (e.g. CoAB's town) does not reach campaign.
        game["campaign_matrix"] = {"satisfied": False, "failing_legs": ["town"]}
        self.assertEqual(goldbox_corpus.evidence_level(game), "persistent")
        # Only a fully-satisfied matrix (every leg proven or structurally-absent) reaches campaign.
        game["campaign_matrix"] = {"satisfied": True, "failing_legs": []}
        self.assertEqual(goldbox_corpus.evidence_level(game), "campaign")
        # Verified additionally requires the clean-input browser/Electron checkpoint ledger and
        # a structurally valid, explicit capability/save-gap manifest.
        game["route"]["verification"] = {"status": "verified-contract"}
        game["capabilities"] = {"status": "verified-contract"}
        self.assertEqual(goldbox_corpus.evidence_level(game), "verified")
        game["route"]["verification"]["status"] = "failed-checks"
        self.assertEqual(goldbox_corpus.evidence_level(game), "campaign")
        # Campaign never overrides a failed persistence contract -- the base tier still gates it.
        game["route"]["persistence"]["status"] = "failed-checks"
        self.assertEqual(goldbox_corpus.evidence_level(game), "combat")

    def test_cok_verified_contract_references_real_checkpoint_markers_and_explicit_save_gaps(self) -> None:
        route = goldbox_corpus.load_routes()["champions-of-krynn"]
        verification = goldbox_corpus.verify_release_contract(route)
        self.assertEqual(verification["status"], "verified-contract")
        self.assertTrue(all(verification["checks"].values()))

        capabilities = goldbox_corpus.validate_capability_contract(
            goldbox_corpus.load_capabilities()["champions-of-krynn"]
        )
        self.assertEqual(capabilities["status"], "verified-contract")
        saves = capabilities["capabilities"]["retail_save"]
        self.assertEqual(saves["import"]["status"], "partial")
        self.assertEqual(saves["export"]["status"], "partial")
        self.assertTrue(saves["import"]["gaps"])
        self.assertTrue(saves["export"]["gaps"])

    # --- evidence markers must live in code the harness actually runs -----------------------------
    # Added 2026-08-17. `_evidence_refs_resolve` used to accept a marker ANYWHERE in a named file,
    # so a case that was declared and registered in the GB_E2E_ONLY dispatch map but never awaited
    # by main() backed Verified checkpoints while having no standing execution. The fixture below is
    # the whole shape of that defect in miniature, plus the two ways the predicate must still say
    # yes -- case (b) especially, since CoK's real markers sit in a helper main() never calls.

    _REACHABILITY_FIXTURE = """\
async function driveSharedOpening(page, errors) {
  // (b) reached only THROUGH a live case, never called by main() itself.
  if (!page.ok) errors.push('fixture-helper-marker');
}

async function runLiveCase(browser) {
  const page = await browser.newPage();
  const errors = [];
  await driveSharedOpening(page, errors);
  // (c) directly inside a case main() awaits.
  if (!page.ok) errors.push('fixture-live-case-marker');
  return { id: 'live-case', errors };
}

async function runRegisteredButNeverAwaited(browser) {
  const page = await browser.newPage();
  const errors = [];
  // (a) registered for GB_E2E_ONLY, awaited by nothing.
  if (!page.ok) errors.push('fixture-dead-case-marker');
  return { id: 'dead-case', errors };
}

async function main() {
  if (ONLY.size > 0) {
    const focused = [];
    const runners = new Map([
      ['live-case', () => runLiveCase(browser)],
      ['dead-case', () => runRegisteredButNeverAwaited(browser)],
    ]);
    for (const id of ONLY) focused.push(await runners.get(id)());
    return printResults(focused);
  }
  const live = await runLiveCase(browser);
  return printResults([live]);
}
"""

    def _resolve_fixture_marker(self, root: Path, rel: str, marker: str) -> bool:
        return goldbox_corpus._evidence_refs_resolve(
            [{"file": rel, "marker": marker}], repo_root=root
        )

    def test_e2e_evidence_marker_must_sit_in_code_main_actually_reaches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            harness = root / "apps/web/test/e2e.mjs"
            harness.parent.mkdir(parents=True, exist_ok=True)
            harness.write_text(self._REACHABILITY_FIXTURE, encoding="utf-8")
            # Every marker really is present as a substring, so a rejection below can only come
            # from the reachability rule and not from a typo in the fixture.
            for marker in ("fixture-helper-marker", "fixture-live-case-marker", "fixture-dead-case-marker"):
                self.assertIn(marker, harness.read_text(encoding="utf-8"))

            # (a) dead code is not evidence.
            self.assertFalse(
                self._resolve_fixture_marker(root, "apps/web/test/e2e.mjs", "fixture-dead-case-marker")
            )
            # (b) transitively reached helper IS evidence -- the anti-regression guard for CoK,
            # whose opening_dialogue/quest/town_service markers live in `driveCokOpeningToTravel`.
            self.assertTrue(
                self._resolve_fixture_marker(root, "apps/web/test/e2e.mjs", "fixture-helper-marker")
            )
            # (c) the ordinary directly-awaited case.
            self.assertTrue(
                self._resolve_fixture_marker(root, "apps/web/test/e2e.mjs", "fixture-live-case-marker")
            )

            # The reachability rule is scoped to the two harnesses; the same bytes under another
            # path keep the plain substring contract, which pins WHY (a) was rejected.
            other = root / "docs/notes.mjs"
            other.parent.mkdir(parents=True, exist_ok=True)
            other.write_text(self._REACHABILITY_FIXTURE, encoding="utf-8")
            self.assertTrue(self._resolve_fixture_marker(root, "docs/notes.mjs", "fixture-dead-case-marker"))

    def test_dok_release_checkpoints_rest_on_e2e_cases_the_full_suite_runs(self) -> None:
        # DoK's claim was never false -- `dok-campaign-opening` passes 1/1 when run standalone --
        # but 9 of its 13 checkpoints cited markers inside `runDokCampaignOpening`, which main()
        # did not await. This pins the wiring, not the route's verdict.
        route = goldbox_corpus.load_routes()["death-knights-of-krynn"]
        verification = goldbox_corpus.verify_release_contract(route)
        self.assertEqual(verification["status"], "verified-contract")
        self.assertTrue(all(verification["checks"].values()), verification["failed_checks"])

        harness = goldbox_corpus.REPO_ROOT / "apps/web/test/e2e.mjs"
        text = harness.read_text(encoding="utf-8")
        for marker in ("dok-opening-first-narrative", "dok-campaign-sivak-resume", "dok-campaign-load-restore"):
            self.assertTrue(goldbox_corpus.marker_reaches_live_code(text, marker), marker)

        # The GB_E2E_ONLY block must still be FOUND in the real harness. If a refactor renames its
        # `if (ONLY.size > 0)` guard or its `return printResults(focused)` tail, the exclusion
        # silently empties and every registered-but-unrun case would start counting as live again --
        # the exact hole this predicate exists to close, reopened without anything going red.
        lines = text.splitlines()
        skipped = goldbox_corpus._js_focused_block_lines(lines)
        self.assertTrue(skipped)
        registration = next(i for i, line in enumerate(lines) if "['dok-campaign-opening'," in line)
        self.assertIn(registration, skipped)

        # NULL for the exclusion itself. The registry moved out of the `if (ONLY.size > 0)` block
        # on 2026-08-22 so the full pass could check itself against it, which broke the assertion
        # above until `_js_focused_block_lines` learned to anchor on the registry declaration. An
        # over-broad repair -- excluding from the registry to end-of-file, say -- would satisfy
        # that line while swallowing the entire full run and marking every case dead. So assert
        # the other direction too: the awaited call in main() must NOT be excluded.
        awaited = next(
            i for i, line in enumerate(lines) if "await runDokCampaignOpening(browser)" in line
        )
        self.assertNotIn(awaited, skipped)
        self.assertLess(registration, awaited)
        # And the block must be a bounded region, not most of the file.
        self.assertLess(len(skipped), len(lines) // 2)

    # --- ADR-0010: `structurally-absent` release checkpoints -------------------------------------
    # A checkpoint may be satisfied by a proven negative instead of positive evidence. The whole
    # value of that mechanism depends on it being HARDER to satisfy than citing a marker, so these
    # tests spend most of their length on the ways it must refuse, not on the way it accepts.

    _ABSENT_OK = {
        "status": "structurally-absent",
        "capability": "wilderness",
        "evidence": [
            {"file": "tools/goldbox_corpus.py", "marker": "STRUCTURALLY_ABSENT_CHECKPOINTS"}
        ],
    }
    _ABSENT_LEDGER = {
        "capabilities": {
            "wilderness": {"status": "structurally-absent"},
            "quests": {"status": "proven"},
        }
    }

    def _checkpoint_ok(self, value, checkpoint="wilderness_travel", ledger=None) -> bool:
        route = {
            "id": "x",
            "verification": {
                "input": "user-selected-retail-folder",
                "checkpoints": {checkpoint: value},
            },
        }
        result = goldbox_corpus.verify_release_contract(
            route, self._ABSENT_LEDGER if ledger is None else ledger
        )
        return result["checks"][f"checkpoint_{checkpoint}"]

    def test_structurally_absent_checkpoint_accepts_a_fully_backed_proven_negative(self) -> None:
        self.assertTrue(self._checkpoint_ok(self._ABSENT_OK))
        # ...and the positive form is untouched by the new branch.
        self.assertTrue(
            self._checkpoint_ok(
                [{"file": "tools/goldbox_corpus.py", "marker": "VERIFIED_CHECKPOINTS"}]
            )
        )
        # The waiver is surfaced rather than folded silently into a pass.
        route = {
            "id": "x",
            "verification": {
                "input": "user-selected-retail-folder",
                "checkpoints": {"wilderness_travel": self._ABSENT_OK},
            },
        }
        result = goldbox_corpus.verify_release_contract(route, self._ABSENT_LEDGER)
        self.assertEqual(result["structurally_absent"], ["wilderness_travel"])

    def test_structurally_absent_checkpoint_refuses_every_way_of_cheating_it(self) -> None:
        ok = self._ABSENT_OK
        rejected = {
            # Only this one status. Not an escape hatch for `unsupported`/`partial`.
            "wrong status": ({**ok, "status": "unsupported"}, "wilderness_travel", None),
            # Naming a different area than the sanctioned one for this checkpoint.
            "capability mismatch": ({**ok, "capability": "quests"}, "wilderness_travel", None),
            # The ledger must ALSO call it structurally-absent; `quests` there is `proven`.
            "ledger says proven": ({**ok, "capability": "quests"}, "quest", None),
            # A proven negative still points at something real.
            "no evidence key": ({k: v for k, v in ok.items() if k != "evidence"}, "wilderness_travel", None),
            "empty evidence": ({**ok, "evidence": []}, "wilderness_travel", None),
            "evidence file absent": (
                {**ok, "evidence": [{"file": "tools/no_such_file.py", "marker": "x"}]},
                "wilderness_travel",
                None,
            ),
            "marker absent from a real file": (
                {**ok, "evidence": [{"file": "tools/goldbox_corpus.py", "marker": "zzz_not_present"}]},
                "wilderness_travel",
                None,
            ),
            # Engine-side checkpoints are properties of OUR port and are never waivable. The
            # graphics_switch case is the one that matters most: NWN cannot satisfy it either, but
            # its blocker is that no Amiga release exists to source art from -- a project sourcing
            # gap, not a feature the game structurally lacks. See ADR-0010.
            "graphics_switch not waivable": (ok, "graphics_switch", None),
            "electron not waivable": (ok, "electron", None),
            "exploration not waivable": (ok, "exploration", None),
            # No ledger at all cannot be treated as consent.
            "missing ledger": (ok, "wilderness_travel", {}),
        }
        for name, (value, checkpoint, ledger) in rejected.items():
            with self.subTest(name):
                self.assertFalse(self._checkpoint_ok(value, checkpoint, ledger), name)

    def test_structurally_absent_matches_the_campaign_gate_precedent(self) -> None:
        # ADR-0010 rests on the release contract being brought in line with a decision the campaign
        # gate in the same module already made. If that precedent is ever narrowed, the ADR's
        # justification goes with it, so pin it here rather than in prose only.
        self.assertIn("structurally-absent", goldbox_corpus.CAMPAIGN_PASSING_LEG_STATUSES)
        self.assertIn("structurally-absent", goldbox_corpus.CAPABILITY_STATUSES)
        # NWN's wilderness is the real proven negative this exists for; if it is ever downgraded,
        # the mechanism has no live subject and should be revisited.
        nwn = goldbox_corpus.load_capabilities()["neverwinter-nights-dos"]
        self.assertEqual(nwn["capabilities"]["wilderness"]["status"], "structurally-absent")

    def test_dok_selected_folder_import_claim_keeps_full_save_gaps_explicit(self) -> None:
        capabilities = goldbox_corpus.validate_capability_contract(
            goldbox_corpus.load_capabilities()["death-knights-of-krynn"]
        )
        self.assertEqual(capabilities["status"], "verified-contract")
        imported = capabilities["capabilities"]["retail_save"]["import"]
        self.assertEqual(imported["status"], "partial")
        self.assertIn("retained user-selected DoK folder", imported["scope"])
        self.assertIn("no selected-source fallback", imported["scope"])
        gaps = " ".join(imported["gaps"])
        for unresolved in ("HP/class/level", ".EFF", "SAVGAMA.PTY", "unique/magic item"):
            self.assertIn(unresolved, gaps)

        claims = json.loads(goldbox_corpus.SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        claim = next(
            game for game in claims["games"]
            if game["profile_id"] == "death-knights-of-krynn"
        )
        self.assertIn("selected DoK folder", claim["web_text"])
        self.assertIn("without falling through", claim["web_text"])
        self.assertNotIn("bundled .GAM/.JNK/.WIZ character import", claim["missing"])
        for unresolved in ("derived HP/class/level", "SAVGAMA.PTY", ".EFF", "unique/magic items"):
            self.assertIn(unresolved, claim["missing"])

    def test_pool_verified_contract_references_real_checkpoint_markers_and_explicit_save_gaps(self) -> None:
        route = goldbox_corpus.load_routes()["pool-of-radiance"]
        verification = goldbox_corpus.verify_release_contract(route)
        self.assertEqual(verification["status"], "verified-contract")
        self.assertTrue(all(verification["checks"].values()))

        capabilities = goldbox_corpus.validate_capability_contract(
            goldbox_corpus.load_capabilities()["pool-of-radiance"]
        )
        self.assertEqual(capabilities["status"], "verified-contract")
        saves = capabilities["capabilities"]["retail_save"]
        self.assertEqual(saves["import"]["status"], "unsupported")
        self.assertEqual(saves["export"]["status"], "unsupported")
        self.assertTrue(saves["import"]["gaps"])
        self.assertTrue(saves["export"]["gaps"])

    def test_coab_verified_contract_references_real_checkpoint_markers_and_explicit_save_gaps(self) -> None:
        route = goldbox_corpus.load_routes()["curse-of-the-azure-bonds"]
        verification = goldbox_corpus.verify_release_contract(route)
        self.assertEqual(verification["status"], "verified-contract")
        self.assertTrue(all(verification["checks"].values()))

        capabilities = goldbox_corpus.validate_capability_contract(
            goldbox_corpus.load_capabilities()["curse-of-the-azure-bonds"]
        )
        self.assertEqual(capabilities["status"], "verified-contract")
        saves = capabilities["capabilities"]["retail_save"]
        # R2 (2026-09-03): import moved unsupported -> partial when ?import=coab landed. Export did
        # NOT move, and that asymmetry is the point of pinning both sides here rather than one: a
        # shipped reader must never be allowed to imply a writer.
        self.assertEqual(saves["import"]["status"], "partial")
        self.assertEqual(saves["export"]["status"], "unsupported")
        self.assertTrue(saves["import"]["gaps"])
        self.assertTrue(saves["export"]["gaps"])
        # "partial" has to keep costing something. The gaps must still name the two limits that make
        # it partial rather than supported -- the pregen-only scope and the ruleset translation --
        # so a later widening of the importer cannot silently inherit this verdict.
        import_gaps = " ".join(saves["import"]["gaps"])
        self.assertIn("CHRDATA pregens", import_gaps)
        self.assertIn("TRANSLATED", import_gaps)

    def test_campaign_matrix_leg_statuses_gate_satisfied_as_designed(self) -> None:
        proven_or_absent = {"a": {"status": "proven"}, "b": {"status": "structurally-absent"}}
        blocked = {"a": {"status": "proven"}, "b": {"status": "blocked"}}
        not_tracked = {"a": {"status": "proven"}, "b": {"status": "not-tracked"}}
        legs = ["a", "b"]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "matrix.json"
            for leg_map, expect_satisfied, expect_failing in (
                (proven_or_absent, True, []),
                (blocked, False, ["b"]),
                (not_tracked, False, ["b"]),
            ):
                path.write_text(
                    json.dumps({"schema_version": 1, "legs": legs, "games": [{"profile_id": "x", "legs": leg_map}]}),
                    encoding="utf-8",
                )
                matrix = goldbox_corpus.load_campaign_matrix(path)
                self.assertEqual(matrix["x"]["satisfied"], expect_satisfied)
                self.assertEqual(matrix["x"]["failing_legs"], expect_failing)

    def test_fully_satisfied_campaign_matrix_profiles(self) -> None:
        # Ground-truth regression against the checked-in matrix: all five tracked games resolved
        # every leg (Secret's wilderness leg counts as passing because it is a proven structural
        # absence, not an unresolved block). CoAB's town leg
        # now proves the continuous ECL5#48 -> ECL1#80 node-9 ENTER CITY -> ECL5#49/GEO5#50
        # patrol/save/exit -> ECL5#48 -> ECL1#80 round trip without inventing a Town engine mode;
        # its quest leg uses ECL2#3's [0x4C28] Tilverton-help producer and ECL6#64's independent
        # recognition/temple-diversion consumer, outside the earlier four-route-word negative scan.
        # Pool's
        # cross-block Holy Symbol route resolves its former quest blocker through ECL1#18, ECL7#26,
        # and ECL1#24 with the type-74 item preserved through the Temple gate and save/reload.
        # DoK's path here: middle proven 2026-07-22 (persistent-natural-routes.md § DoK's Fourth
        # Route -- the prior "cross-block flag [0xC00D]" blocker was a transcription slip for
        # [0xC04D], the facing register); ending + quest proven 2026-07-23 (§ DoK's Fifth Route --
        # ECL3#98 Dargaard Keep, whose own initial_entry byte-grounds the real spawn (8,14) that
        # refutes Update 13's wrong-spawn unreachability verdict -- and § DoK's Sixth Route --
        # [0x4CD0], single corpus-wide write at ECL3#98 0x8CAB, 25 cross-archive reads, headline
        # reader ECL2#64's restored-graveyard gate; dok-natural-route.md Update 15).
        # 2026-08-05: gateway-to-the-savage-frontier joins the set as the SIXTH game and the first
        # beyond the original five. Its last three legs landed this round, all engine-level from
        # static retail bytes only (no DOSBox-X, no native capture, no browser wiring):
        # middle  = ECL4.DAX#12 / GEO4.DAX#12, the shipwreck island -- two forced encounters
        #           (SCRAG x3 at the (12,10) articulation point, then PIRATE x5 + SCRAG x1 in the
        #           lighthouse), consumed words [0x4C09]/[0x4C0B];
        #           docs/engine/research/gateway-middle-route.md,
        #           packages/engine/test/gatewayMiddleRoute.test.ts.
        # ending  = ECL6.DAX#20 / GEO6.DAX#20, Ascore's three-stage mirror gauntlet, counter
        #           [0x4C45] 1->2->3->4 with per-wall bits OR'd into [0x4C46];
        #           docs/engine/research/gateway-ending-route.md,
        #           packages/engine/test/gatewayEndingRoute.test.ts.
        # quest   = cross-archive flag [0x4C21] "Amanitas rescued", single corpus-wide write at
        #           ECL3.DAX#5 @0x9026, eleven reads (ten of them in a different archive), headline
        #           consumer ECL2.DAX#1 arm 30 @0x917D; docs/engine/research/gateway-quest-flag.md,
        #           packages/engine/test/gatewayQuestFlag.test.ts.
        # Each of the three was independently re-audited by a skeptic pass and landed as
        # "stands-with-caveats"; the caveats are folded into the matrix citations verbatim rather
        # than dropped. Promoting Gateway to `campaign` deliberately surfaces two NEW honest gaps
        # for it in goldbox_corpus.py -- `verified-release-contract-missing` and
        # `capability-manifest-missing-or-invalid` -- because the campaign tier is where those
        # checks start applying. Those gaps are real and undischarged, not regressions.
        #
        # 2026-08-05 (same day, later): neverwinter-nights-dos joins the set as the SEVENTH game.
        # It entered this round with early=proven and wilderness=structurally-absent; the four
        # remaining legs were investigated, then adversarially refuted, and every refuter defect was
        # applied to the owning doc AND its golden before this line changed. What landed:
        # middle  = proven. GEO1.DAX#17 / ECL1.DAX#17. Three distinct reachable NEWECL #17 arms set
        #           three different entry poses -- (15,10) @0x92B4, (2,7) @0x94A9, (15,0) @0x96C9 --
        #           landing in pairwise-disjoint 72 / 60 / 57-cell components; the leg is proven on
        #           the 72-cell one and the forced fight is now stated CONDITIONALLY (any route
        #           reaching the descriptor-108 chamber at (0,9) must cross (2,11) and (1,11)).
        #           docs/engine/research/nwn-middle-route.md,
        #           packages/engine/test/nwnMiddleRoute.test.ts (13 tests).
        # ending  = structurally-absent -- a first-class result, carrying two independent pieces of
        #           evidence in the shape Secret's wilderness leg set: no player-facing ending text
        #           over the UNION of a byte-position scan and an unfiltered instruction-aligned
        #           scan, and no terminal block plus no FINAL*.DAX in an engine whose GAME.OVR still
        #           names it. The prior draft's "CONGRAT occurs 0 times" was FALSE -- the >=85%
        #           shape filter had hidden one villain-to-villain line at ECL0#8 @0x14e9 -- and it
        #           is withdrawn in both the doc and the golden; the verdict is unchanged because
        #           that line is an overheard Zhentarim ambush scene, not a denouement.
        #           docs/engine/research/nwn-ending-route.md,
        #           packages/engine/test/nwnEndingRoute.test.ts (19 tests).
        # town    = proven. ECL0.DAX#1 / GEO0.DAX#1, Neverwinter: two 38-arm dispatch tables, six
        #           service doors, a 42-step legal circuit executed through the real EclVm. The
        #           discriminator is corrected: EnterTemple (0x7EE2) ALONE selects the four named
        #           settlements, so the earlier "only the cluster is the argument" framing is
        #           retracted, and the sign/door invariant is restated in the direction that holds.
        #           docs/engine/research/nwn-town-route.md,
        #           packages/engine/test/nwnTownRoute.test.ts (14 tests).
        # quest   = proven. Cross-archive dock password on [0x32C8]/[0x32CA]: sole password-index
        #           writer at ECL5#51 @0x9572/@0x9582, 25 COMPARE reads in ECL1#14, and [0x32CA] is
        #           the only word corpus-wide read by a block that never writes it. The honest
        #           negative stands undiminished -- the setter's console cell is walk-unreachable
        #           from all seven poses ECL0#1 declares -- and the full 37-writer set is disclosed
        #           rather than filtered down to the 28-site day cache.
        #           docs/engine/research/nwn-quest-flag.md,
        #           packages/engine/test/nwnQuestFlag.test.ts (16 tests).
        # As with Gateway, promoting NWN to `campaign` may surface new honest gaps that only apply
        # at that tier; those would be real undischarged gaps, not regressions.
        #
        # 2026-08-06: treasures-of-the-savage-frontier joins the set as the EIGHTH game. It entered
        # this round with early=proven only; the five remaining legs were investigated, then
        # adversarially refuted (all five came back `stands-with-caveats`, none `refuted`), and every
        # recorded refuter defect was applied to the owning doc AND its golden before this line
        # changed. Static byte-level work only -- no DOSBox-X, no native capture, no browser wiring.
        # Structural constraint that shapes all five: Treasures ships exactly ONE script archive
        # (ECL1.DAX, 251,712 bytes, 30 blocks), so the cross-archive discrimination Gateway's and
        # NWN's quest legs lean on is unavailable here and is replaced by corpus-wide
        # single-writer/multi-reader shapes, disclosed as such. What landed:
        # middle  = proven. ECL1.DAX#33 / GEO1.DAX#33, underground Fireshear. Spawn (6,15,north)
        #           from block 33's own initial_entry, 36 legal directed steps to the descriptor-0xFF
        #           cubicle at (13,14) (one of six, BFS 35/36/36/37/37/38), 22 proven articulation
        #           points, YETI CHIEF x3 + ORC CHIEF x3, three-word persistent delta.
        #           docs/engine/research/treasures-middle-route.md,
        #           packages/engine/test/treasuresMiddleRoute.test.ts (12 tests).
        # ending  = proven. ECL1.DAX#38 from GEO1.DAX#38's descriptor-0xF9 cells (2,6)/(3,6):
        #           FREEZFIRE (MON1CHA id 88) -> victory 0x9F41 -> six-beat denouement -> last line
        #           0xA31D -> NEWECL #51 with spawn quad (3,7,1,54). Needed two further dialect
        #           corrections (opcodes 0x27/0x37), proven from the corpus but NOT from Treasures'
        #           own GAME.OVR handler bytes -- that caveat is carried, not dropped.
        #           docs/engine/research/treasures-ending-route.md,
        #           packages/engine/test/treasuresEndingRoute.test.ts (15 tests).
        # town    = proven. No SAVE <n>,0x4BE6 and no CoAB Area2 service addresses exist in this
        #           title, so the leg rests on its own remapped markers [0x0004]/[0x0014]/[0x0028]/
        #           [0x0030] ([0x00c8] is explicitly NOT one), cross-checked by a raw needle scan and
        #           an 89.0%-coverage reachability walk, with a host-CALL-refuses negative control.
        #           docs/engine/research/treasures-town-route.md,
        #           packages/engine/test/treasuresTownRoute.test.ts (15 tests).
        # wilderness = proven. The corpus-wide zero for 0x4BE6 is a model mismatch, not an absence:
        #           the GAME.OVR range ladder at 0x79F6 types it 4 and the setter drops types > 2.
        #           Mode is area[0x3F] = ECL-visible [0x0040], consumed by the floor-builder dispatch
        #           (dungeon local 0x0697 vs wilderness local 0x0EA3); ECL1#51 is the overland driver.
        #           docs/engine/research/treasures-wilderness-route.md,
        #           packages/engine/test/treasuresWildernessRoute.test.ts (12 tests).
        # quest   = proven. [0x025C] "FREEZEFIRE slain": sole corpus-wide writer SAVE #1 -> [0x025C]
        #           at ECL1#38 @0x9F3B on the combat-victory arm, exhaustiveness re-run over ALL
        #           word-referencing operand encodings (01/02/03/81/7f), three COMPARE readers in
        #           ECL1#19/#33/#51, headline consumer the dock (ICE PEAK destination removed).
        #           docs/engine/research/treasures-quest-flag.md,
        #           packages/engine/test/treasuresQuestFlag.test.ts (8 tests).
        # Caveat carried into this pin, not hidden: the refuters' verbatim `correctedCitation`
        # strings were lost to a context compaction before transcription, so the five Treasures
        # matrix citations are transcriber-authored from the refuter-corrected docs rather than
        # literal refuter text. Their content is doc-grounded; their provenance is not verbatim.
        #
        # 2026-08-06 (same day, later): pools-of-darkness joins the set as the NINTH game, on its
        # last open leg.
        # ending  = proven. ECL1.DAX#75, the destruction of Bane's crystal. Block 75 is a CUTSCENE
        #           block, not a map area: all four header entries point at 0x97A8 (a bare EXIT),
        #           it holds zero cellDescAddr (0x002D) references, and its single ON_GOTO (0x89BD)
        #           is on the combat tier [0x025C], so arm selection is by persistent flag only --
        #           0x801A [0x02EE], 0x8025 [0x0254], 0x8030 [0x01D0], else the mid-campaign
        #           fall-through. The completion latch [0x02EE] has ONE writer in all 56 blocks,
        #           blk75@0x9666 SAVE #255 -> [0x02EE], against 18 readers across 12 blocks, and it
        #           gates block 24's own first instruction (0x8014 COMPARE [0x02EE],#0 / IF_EQ /
        #           NEWECL #16) -- i.e. the post-victory Phlan refuses to exist without it. The
        #           canonical walk of block 75 is decoded=512 / truncated=0 / explored_states=617 /
        #           state_limit_reached=False via tools/gen1_ecl_encounter_scan.py's own scan_block
        #           with BOTH word_sets_for_profile and opcodes_for_profile for this profile; the
        #           extended opcode 0x41 POOLS_AWARD_XP is load-bearing (without it the block
        #           truncates at 0x8A8C and the whole finale is invisible), and a hand-rolled walk
        #           reporting 84 or 244 has dropped the compare-outcome reset or the GOSUB stack.
        #           docs/engine/research/pools-ending-route.md,
        #           packages/engine/test/poolsEndingRoute.test.ts (10 tests, 132 expect() calls).
        # Three caveats carried into this pin rather than hidden. (1) The two flag-seeded finale
        # runs HALT on step budget, because the 0x9817 crystal-bearer scan compares two string
        # cells the headless VM never populates (EclVm.rvalue returns the 0x81 pointer itself, so
        # 0x032B vs 0x0401 forever); those runs prove arm SELECTION only, and the terminus is
        # proven separately by entering at each balor arm's own vaddr. (2) Reach from the game's
        # own boot block is NOT proven -- the Phlan cluster {16,23,24,25,39,40} is a sink in the
        # immediate-NEWECL graph -- but that gap is pre-existing and corpus-wide and already sits
        # under this game's already-proven middle leg (ECL1#34 is likewise in-degree-zero). (3) A
        # real, byte-proven dialect defect is deliberately NOT shipped: Gen1-short opcode 0x31 is a
        # MENU (wordSet 2, countAt 1), not the shared table's zero-operand SPRITE_OFF. Correcting
        # only that frame takes Pools from 29,356 to 32,516 reachable instructions, 448 to 335
        # illegal operand codes, and 0/403 to 403/403 inline menu items decoding to legal English,
        # and improves DoK identically -- but it REGRESSES CoAB (Gen1-long), so it needs its own
        # scoped change and gates. It costs this leg exactly four bytes (blk75@0x87CC GOTO 0x8904,
        # whose target is reached anyway), which the golden asserts so the gap is visible.
        matrix = goldbox_corpus.load_campaign_matrix()
        satisfied = {profile_id for profile_id, entry in matrix.items() if entry["satisfied"]}
        self.assertEqual(
            satisfied,
            {
                "champions-of-krynn",
                "secret-of-the-silver-blades",
                "death-knights-of-krynn",
                "pool-of-radiance",
                "curse-of-the-azure-bonds",
                "gateway-to-the-savage-frontier",
                "neverwinter-nights-dos",
                "treasures-of-the-savage-frontier",
                "pools-of-darkness",
                # Added 2026-08-10. `dc12cd1` resolved DQK's `ending` -- the corpus's last blocked
                # leg -- by establishing that [0x0032] is the facing wall type served by DQK.EXE's
                # class-0 special-address table, not a story flag, so the four `SAVE #0,[0x0032]`
                # sites are dead stores against a byte the read path never consults. That commit
                # flipped the leg in the matrix but did not update this golden, so the suite has
                # been red on HEAD since. All six DQK legs are `proven`.
                "dark-queen-of-krynn",
            },
        )
        self.assertEqual(matrix["curse-of-the-azure-bonds"]["legs"]["town"]["status"], "proven")
        self.assertEqual(matrix["curse-of-the-azure-bonds"]["legs"]["quest"]["status"], "proven")
        self.assertEqual(matrix["curse-of-the-azure-bonds"]["failing_legs"], [])
        self.assertEqual(matrix["pool-of-radiance"]["failing_legs"], [])
        self.assertEqual(matrix["death-knights-of-krynn"]["failing_legs"], [])
        gateway = matrix["gateway-to-the-savage-frontier"]
        self.assertEqual(gateway["failing_legs"], [])
        for leg in ("early", "middle", "ending", "town", "wilderness", "quest"):
            self.assertEqual(gateway["legs"][leg]["status"], "proven", leg)
        treasures = matrix["treasures-of-the-savage-frontier"]
        self.assertEqual(treasures["failing_legs"], [])
        for leg in ("early", "middle", "ending", "town", "wilderness", "quest"):
            self.assertEqual(treasures["legs"][leg]["status"], "proven", leg)

    def test_length_prefixed_monster_name_decode(self) -> None:
        raw = bytes([5]) + b"TROLL" + bytes(20)
        self.assertEqual(goldbox_corpus.decode_record_name(raw), "TROLL")

    def test_gen2_geo_shape_uses_variable_dimensions(self) -> None:
        self.assertTrue(goldbox_corpus.sniff_gen2_geo(bytes([10, 10]) + bytes(406)))
        self.assertFalse(goldbox_corpus.sniff_gen2_geo(bytes([10, 10]) + bytes(405)))

    def test_archive_categories_cover_program_formats(self) -> None:
        expected = {
            "ECL1.DAX": "ecl",
            "GEO2.DAX": "geo",
            "WALLDEF1.DAX": "wall",
            "MON1CHA.DAX": "monster",
            "ITEM1.DAX": "item",
            "8X8D1.DAX": "graphics",
            "MUSIC.DAX": "audio",
            "SAVGAMA.QSV": "save",
        }
        self.assertEqual({name: goldbox_corpus.archive_category(name) for name in expected}, expected)

    def test_dqk_route_declares_hlib_contract(self) -> None:
        route = goldbox_corpus.load_routes()["dark-queen-of-krynn"]
        self.assertEqual(route["container_kind"], "hlib-gen2")
        self.assertEqual(route["ecl_area"], 5)
        self.assertEqual(route["load_files_geo"], 2)
        self.assertEqual(route["persistence"]["memory_address"], 0x003A)
        self.assertEqual(route["persistence"]["consumed_value"], 1)

    # Renamed 2026-08-17 from `test_checked_in_support_claims_do_not_exceed_corpus`. The body is
    # unchanged; what changed is `validate_support_claims`, which now also reports a claim that sits
    # BELOW the level the corpus derives. The old name described a one-sided gate, and while it held
    # five titles published `persistent` against a corpus-derived `campaign`.
    def test_checked_in_support_claims_match_corpus_level_exactly(self) -> None:
        corpus = goldbox_corpus.build_corpus()
        evidence = goldbox_corpus.public_support_evidence(corpus)
        self.assertEqual(goldbox_corpus.validate_support_claims(evidence), [])

    def test_support_claim_drift_rejects_unproven_combat_level(self) -> None:
        evidence = {
            "games": [{"profile_id": "pool-of-radiance", "level": "route"}],
        }
        claims = {"games": [{"profile_id": "pool-of-radiance", "web_level": "combat"}]}
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "claims.json"
            path.write_text(json.dumps(claims), encoding="utf-8")
            errors = goldbox_corpus.validate_support_claims(evidence, path)
        self.assertEqual(errors, ["pool-of-radiance: claims combat, corpus permits only route"])

    def test_support_claim_drift_rejects_understated_level(self) -> None:
        """The under-claim direction, guarded the way the test above guards the over-claim one.

        Publishing less than the evidence supports is conservative, so it never misleads a reader --
        but it is also the direction this ledger actually drifts, because the corpus advances on its
        own and the checked-in JSON does not. Left ungated it makes the whole file unfalsifiable.
        """
        evidence = {
            "games": [{"profile_id": "pool-of-radiance", "level": "campaign"}],
        }
        claims = {"games": [{"profile_id": "pool-of-radiance", "web_level": "persistent"}]}
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "claims.json"
            path.write_text(json.dumps(claims), encoding="utf-8")
            errors = goldbox_corpus.validate_support_claims(evidence, path)
        self.assertEqual(errors, ["pool-of-radiance: claims persistent, corpus derives campaign"])
        self.assertEqual(goldbox_corpus.SUPPORT_CLAIM_LAG_EXCEPTIONS, {})

    def test_support_page_prose_does_not_contradict_the_campaign_matrix(self) -> None:
        """The one hand-written paragraph on the support page, tied back to its own sources.

        Added 2026-08-17. `apps/web/src/ui/support.ts` had asserted for weeks that Gateway's matrix
        recorded "early, middle, ending and quest not yet investigated" while all six of its legs
        read `proven`, and called Treasures "Persistent" against a corpus-derived `campaign`. That
        paragraph is the only place on the page where a level is stated in prose instead of being
        rendered from the evidence JSON, so nothing could catch it. This test is the missing tie.
        """
        source = (goldbox_corpus.REPO_ROOT / "apps/web/src/ui/support.ts").read_text(encoding="utf-8")
        start = source.index("['P3 Savage Frontier'")
        paragraph = source[start:source.index("\n", start)]

        matrix = goldbox_corpus.load_campaign_matrix()
        claims = json.loads(goldbox_corpus.SUPPORT_CLAIMS_PATH.read_text(encoding="utf-8"))
        levels = {game["profile_id"]: game["web_level"] for game in claims["games"]}
        titles = {"gateway-to-the-savage-frontier": "Gateway", "treasures-of-the-savage-frontier": "Treasures"}
        for profile_id, name in titles.items():
            self.assertTrue(matrix[profile_id]["satisfied"], profile_id)
            self.assertEqual(matrix[profile_id]["failing_legs"], [], profile_id)
            # The prose must name each title's published level, and must not name a different one.
            self.assertIn(f"{name} is {levels[profile_id].capitalize()}", paragraph)
            for other in ("Missing", "Mapped", "Preview", "Route", "Combat", "Persistent", "Campaign", "Verified"):
                if other.lower() != levels[profile_id]:
                    self.assertNotIn(f"{name} is {other}", paragraph)
        # A satisfied matrix cannot be described as uninvestigated.
        self.assertNotIn("not yet investigated", paragraph)
        # Selected-folder release acceptance: stated as open for exactly the titles that lack one.
        #
        # This was `assertEqual(paragraph.count("... remains open"), 2)` until 2026-08-18, which
        # pinned a falsehood introduced in the same commit as the test. Treasures' acceptance landed
        # in a1dae3d "Add Treasures selected-folder acceptance" (2026-08-01) -- 271 lines of
        # apps/electron/test/e2e.mjs plus capability-ledger entries -- so calling it open was wrong.
        #
        # The tempting mechanical proxy, "does the profile declare a `verification` block in
        # goldbox_corpus_routes.json", is ALSO wrong and was tried first: a1dae3d added no such
        # block, so that predicate reports Treasures as unaccepted. Acceptance is recorded through
        # the Electron harness, so that is what this asks.
        electron = (goldbox_corpus.REPO_ROOT / "apps/electron/test/e2e.mjs").read_text(encoding="utf-8")
        accepted = {
            profile_id: f"electron-{name.lower()}-selected-folder" in electron
            for profile_id, name in titles.items()
        }
        self.assertEqual(accepted, {
            "gateway-to-the-savage-frontier": False,
            "treasures-of-the-savage-frontier": True,
        })
        self.assertEqual(
            paragraph.count("selected-folder release acceptance remains open"),
            sum(1 for ok in accepted.values() if not ok),
        )
        # The count alone would still pass if the one mention sat in the WRONG title's sentence, so
        # split the paragraph where it turns from Gateway to Treasures and check each half.
        split = paragraph.index("Treasures is")
        halves = {
            "gateway-to-the-savage-frontier": paragraph[:split],
            "treasures-of-the-savage-frontier": paragraph[split:],
        }
        for profile_id, half in halves.items():
            phrase = "selected-folder release acceptance remains open"
            if accepted[profile_id]:
                self.assertNotIn(phrase, half, profile_id)
            else:
                self.assertIn(phrase, half, profile_id)

    def test_capability_evidence_paths_resolve(self) -> None:
        """Every path the capability ledger cites as evidence must name a file that exists.

        Until 2026-08-17 `validate_capability_contract` asked only whether the evidence list was a
        non-empty list, so a renamed or deleted source file left the contract green.
        """
        ledger = goldbox_corpus.load_capabilities()
        cited: list[tuple[str, str, str]] = []
        for profile_id, entry in sorted(ledger.items()):
            for area, value in sorted(entry.get("capabilities", {}).items()):
                if not isinstance(value, dict):
                    continue
                if isinstance(value.get("evidence"), list):
                    cited.extend((profile_id, area, ref) for ref in value["evidence"])
                for direction in ("import", "export"):
                    nested = value.get(direction)
                    if isinstance(nested, dict) and isinstance(nested.get("evidence"), list):
                        cited.extend(
                            (profile_id, f"{area}.{direction}", ref) for ref in nested["evidence"]
                        )
        missing = [
            f"{profile_id}:{area}:{ref}"
            for profile_id, area, ref in cited
            if not (goldbox_corpus.REPO_ROOT / ref).is_file()
        ]
        self.assertEqual(missing, [])
        # The count is pinned so that a ledger edit which DELETES evidence cannot pass this test by
        # leaving nothing left to resolve.
        # 96 -> 98 on 2026-09-05 (round 35). Two citations were ADDED, not removed, and both
        # resolve: docs/engine/research/pools-treasures-race-table.md (R4'''s located Pools 0xAEAD /
        # Treasures 0xD454 race tables) and apps/web/test/e2e.mjs. Verified by listing every
        # evidence ref added in this round'''s ledger diff and stat-ing each one, rather than by
        # trusting that a failing count means new work landed -- a deletion plus three additions
        # would also read as +2 here, which is exactly what the missing-list assertion above is
        # for. That list is empty.
        # 98 -> 104 on 2026-09-05 (round 36 R6). SIX citations were ADDED, none removed, and all
        # six resolve: three on each of `treasures-of-the-savage-frontier` and `pools-of-darkness`
        # under retail_save.import -- apps/web/src/ui/importPoolsTreasuresParty.ts,
        # packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts and
        # tools/test_round36_r6_roster_ledger.py (the pin for those two entries' new roster
        # claims). Verified the same way round 35 did it: by listing the evidence refs this
        # round's ledger diff adds and stat-ing each, not by inferring work from a moved count.
        # The missing-list assertion above is still empty, and the area-level breakdown below was
        # unchanged by R6 because all six of its citations sit under retail_save.import (an `area`
        # containing a dot).
        # 104 -> 107 on 2026-09-05 (round 36 R5 follow-up, dispatched mid-round after R6 landed).
        # THREE citations were ADDED to `death-knights-of-krynn`'s `wilderness` area (previously
        # `evidence: null`, so this area had never been in either count before): the new gap
        # bullet reporting that ECL1#17's two PICTURE immediates (id 83 @4274, id 85 @4587) are
        # reachable but never painted (openDokTravel mounts its dialogue with no
        # DialoguePresentation) is backed by packages/engine/test/dokOverlandPictureSites.test.ts,
        # apps/web/src/ui/explore.ts and apps/web/src/ui/dialogue.ts, all three re-verified to
        # resolve on disk before being cited (the missing-list assertion above stays empty).
        # `wilderness` is a plain area name (no dot), so all three land in the breakdown below,
        # not in the retail_save.*/dotted half.
        self.assertEqual(len(cited), 107)
        # 66 of those sit under retail_save.import/export (an `area` string containing a dot);
        # the remaining 41 are area-level. This line was stale at HEAD before round 36 R6 (it read
        # 58+33=91 against the then-pinned 98) and was corrected to 66+38=104 by R6; the follow-up
        # above then moved the area-level half again, 38 -> 41 (wilderness's first three
        # citations), while the dotted half stayed at 66. Recomputed directly from
        # goldbox_corpus.load_capabilities() by re-running the same dot/no-dot split the assertion
        # below performs: 66 + 41 = 107, matching len(cited) above.
        # Until round 29 the area-level arm was Treasures' 4 `towns` citations alone, which made it
        # a weak arm: one profile, one area. Buck Rogers' profile (added round 29, the ledger's
        # twelfth) brought area-level evidence for five further areas; Matrix Cubed's (round 30,
        # the thirteenth) adds 12 area-level rows across six areas, so the arm now bites across
        # 6 distinct areas and 3 profiles rather than 1 and 1.
        # Round 31 raised the `ecl` arm from 7 to 12: Matrix Cubed's `ecl` entry moved from
        # `unsupported` with a single memo citation to `partial` with six, because a dialect was
        # actually derived from its own binary and wired to a route. The count is what makes that
        # arm able to fail -- an edit that quietly drops the new citations shows up here.
        self.assertEqual(
            sorted(area for _, area, _ in cited if "." not in area),
            ["audio"] * 2 + ["ecl"] * 12 + ["graphics"] * 13 + ["map_container"] * 2
            + ["ruleset"] * 5 + ["towns"] * 4 + ["wilderness"] * 3,
        )

    def test_capability_contract_rejects_unresolvable_evidence_path(self) -> None:
        """Both evidence arms must bite: the retail_save sub-record and the area-level list.

        Treasures is the one title whose ledger carries area-level `evidence` (capabilities.towns),
        which the area loop read nothing of before 2026-08-17.
        """
        ledger = goldbox_corpus.load_capabilities()["treasures-of-the-savage-frontier"]
        self.assertEqual(goldbox_corpus.validate_capability_contract(ledger)["status"], "verified-contract")

        broken_save = copy.deepcopy(ledger)
        broken_save["capabilities"]["retail_save"]["import"]["evidence"] = [
            "packages/engine/src/loaders/doesNotExist.ts"
        ]
        result = goldbox_corpus.validate_capability_contract(broken_save)
        self.assertIn("retail_save_import", result["failed_checks"])
        self.assertEqual(result["status"], "failed-checks")

        broken_area = copy.deepcopy(ledger)
        self.assertTrue(broken_area["capabilities"]["towns"]["evidence"])
        broken_area["capabilities"]["towns"]["evidence"] = [
            "packages/engine/src/loaders/doesNotExist.ts"
        ]
        result = goldbox_corpus.validate_capability_contract(broken_area)
        self.assertIn("area_towns_evidence", result["failed_checks"])
        self.assertEqual(result["status"], "failed-checks")

        # An empty list is not evidence either, in either arm.
        emptied_save = copy.deepcopy(ledger)
        emptied_save["capabilities"]["retail_save"]["export"]["evidence"] = []
        self.assertIn(
            "retail_save_export",
            goldbox_corpus.validate_capability_contract(emptied_save)["failed_checks"],
        )
        emptied_area = copy.deepcopy(ledger)
        emptied_area["capabilities"]["towns"]["evidence"] = []
        self.assertIn(
            "area_towns_evidence",
            goldbox_corpus.validate_capability_contract(emptied_area)["failed_checks"],
        )

    def test_function_signature_masks_relocated_immediates(self) -> None:
        left = bytes.fromhex("55 89 e5 b8 34 12 8b 46 04 c3")
        right = bytes.fromhex("55 89 e5 b8 78 56 8b 46 08 c3")
        left_sig = match_goldbox_patterns.function_signature(left)
        right_sig = match_goldbox_patterns.function_signature(right)
        self.assertIsNotNone(left_sig)
        self.assertIsNotNone(right_sig)
        assert left_sig is not None and right_sig is not None
        self.assertNotEqual(left_sig.exact_sha256, right_sig.exact_sha256)
        self.assertEqual(left_sig.normalized_sha256, right_sig.normalized_sha256)
        self.assertEqual(left_sig.shape_sha256, right_sig.shape_sha256)

    def test_anchor_xref_scans_only_complete_clustered_instructions(self) -> None:
        function = bytes.fromhex("55 89 e5 b8 34 12 8b 46 04 c3")
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "GAME.OVR"
            path.write_bytes(function)
            refs = xref_goldbox_anchors.scan_clustered_function_refs(
                str(path),
                {0x1234, 0x048B},
                [{"offset": 0, "size": len(function)}],
                8,
            )
        self.assertEqual([ref.kind for ref in refs[0x1234]], ["mov ax, 0x1234"])
        self.assertEqual(refs[0x048B], [])

    def test_selector_scan_ignores_raw_far_call_bytes_outside_functions(self) -> None:
        raw_data = bytes.fromhex("9a 34 12 78 56 00 00")
        function = bytes.fromhex("55 89 e5 9a 20 00 44 00 cb")
        offsets, counts = gen1_map.collect_lcall_selector_offsets(raw_data + function)
        self.assertEqual(counts, {0x44: 1})
        self.assertEqual(offsets, {0x44: {0x20}})

    def test_vroomm_fixups_are_u16_code_relative_segment_locations(self) -> None:
        code = bytearray(16)
        code[3] = 0x9A
        code[6:8] = bytes.fromhex("34 12")
        code[10:12] = bytes.fromhex("78 56")
        entries, sorted_unique, in_code = vroomm_layout.parse_fixup_entries(
            bytes(code),
            bytes.fromhex("06 00 0a 00"),
        )
        self.assertTrue(sorted_unique)
        self.assertTrue(in_code)
        self.assertEqual(
            [(row.code_offset, row.original_segment, row.context, row.instruction_offset) for row in entries],
            [(6, 0x1234, "lcall_segment", 3), (10, 0x5678, "relocatable_segment_word", None)],
        )

    def test_vroomm_fixup_parser_rejects_odd_and_out_of_code_tables(self) -> None:
        self.assertEqual(vroomm_layout.parse_fixup_entries(bytes(8), b"\x01"), ([], False, False))
        entries, sorted_unique, in_code = vroomm_layout.parse_fixup_entries(bytes(8), bytes.fromhex("08 00"))
        self.assertEqual(entries, [])
        self.assertTrue(sorted_unique)
        self.assertFalse(in_code)

    def test_vroomm_fixup_classifies_mov_segment_immediate_without_target_offset(self) -> None:
        self.assertEqual(
            vroomm_layout.classify_fixup(bytes.fromhex("ba 34 12"), 1),
            ("mov_reg_segment_immediate", 0),
        )

    def test_vroomm_stub_scan_preserves_stride_five_and_tag_byte(self) -> None:
        loader = bytes(14) + bytes(3) + bytes.fromhex("cd 3f 34 12 00 cd 3f 78 56 ff") + bytes(8)
        descriptor = gen1_map.VroommDescriptor(0, 0, 8, 16, 4, 2, 2, None, None)
        self.assertEqual(vroomm_layout.find_stub_candidates(loader, descriptor), [17])

    def test_vroomm_lcall_routes_distinguish_descriptor_headers_and_public_stubs(self) -> None:
        loader = bytes(32) + bytes.fromhex("cd 3f") + bytes(12) + bytes(3) + bytes.fromhex("cd 3f 04 00 00")
        code = bytes.fromhex("9a 00 00 10 00 9a 20 00 10 00") + bytes(6)
        overlay = code + bytes.fromhex("03 00 08 00")
        descriptor = gen1_map.VroommDescriptor(0, 32, 0, len(code), 4, 1, 1, None, None)
        layouts = vroomm_layout.descriptor_layouts(loader, overlay, [descriptor])
        mz = gen1_map.MzInfo(16, len(loader), 0, 0, 0)
        vroomm_layout.classify_lcall_routes(loader, overlay, mz, layouts)
        entries = layouts[0].fixup_entries
        self.assertEqual([entry.route_kind for entry in entries], ["descriptor_header_entry", "public_stub_owned"])
        self.assertEqual(entries[0].target_descriptor_index, 0)
        self.assertEqual(entries[1].target_ovr_file_offset, 4)

    def test_vroomm_stub_overlap_cannot_consume_next_descriptor_header(self) -> None:
        first = bytes.fromhex("cd 3f") + bytes(12) + bytes(3) + bytes.fromhex(
            "cd 3f 00 00 00 cd 3f 02 00 00"
        )
        second = bytes.fromhex("cd 3f") + bytes(12) + bytes(3) + bytes.fromhex("cd 3f 00 00 00")
        loader = first + second
        overlay = bytes(8)
        descriptors = [
            gen1_map.VroommDescriptor(0, 0, 0, 4, 0, 2, 2, 4, 4),
            gen1_map.VroommDescriptor(1, len(first), 4, 4, 0, 1, 1, None, None),
        ]
        layouts = vroomm_layout.descriptor_layouts(loader, overlay, descriptors)
        self.assertEqual(layouts[0].stub_candidate_file_offsets, [17, 22])
        vroomm_layout.classify_lcall_routes(loader, overlay, gen1_map.MzInfo(0, len(loader), 0, 0, 0), layouts)
        self.assertEqual(layouts[0].stub_array_file_offset, 17)
        self.assertEqual(layouts[0].loader_layout_status, "header_boundary_resolved_stride5_stub_array")

    def test_vroomm_call_correlation_accepts_only_exact_cluster_starts(self) -> None:
        layouts = {
            "format_version": 1,
            "games": [
                {
                    "profile_id": "synthetic",
                    "loader_path": "START.EXE",
                    "overlay_path": "GAME.OVR",
                    "descriptors": [
                        {
                            "index": 0,
                            "ovr_file_offset": 8,
                            "fixup_entries": [
                                {
                                    "context": "lcall_segment",
                                    "instruction_offset": 2,
                                    "route_kind": "direct_overlay_code",
                                    "target_ovr_file_offset": 100,
                                },
                                {
                                    "context": "lcall_segment",
                                    "instruction_offset": 7,
                                    "route_kind": "direct_overlay_code",
                                    "target_ovr_file_offset": 105,
                                },
                            ],
                        }
                    ],
                }
            ],
        }
        patterns = {
            "chunk_count": 1,
            "function_cluster_index": [
                {
                    "source": "GAME.OVR",
                    "offset": 100,
                    "size": 10,
                    "normalized_sha256": "abc",
                    "match_kind": "exact",
                    "confidence": "high",
                    "source_count": 2,
                }
            ],
        }
        report = correlate_vroomm_calls.build_report(layouts, patterns)
        self.assertEqual(report["status_counts"], {"exact_cluster_start": 1, "interior_cluster_hit": 1})
        self.assertEqual(report["exact_target_count"], 1)

    def test_coab_listing_units_map_to_retail_descriptors_by_exact_size(self) -> None:
        listing = "\n".join(
            [
                "ovr001:0000 ovr001 segment byte public 'OVERLAY'",
                "ovr001:0002 named_proc proc far",
                "ovr001:0007 named_proc endp",
                "ovr001:0007 ovr001 ends",
            ]
        )
        overlays, functions = map_coab_oracle.parse_listing(listing)
        self.assertEqual([(row.unit, row.listing_size) for row in overlays], [(1, 8)])
        self.assertEqual([(row.unit, row.unit_offset, row.symbol) for row in functions], [(1, 2, "named_proc")])
        mappings = map_coab_oracle.map_overlays(
            overlays,
            {"descriptors": [{"index": 0, "ovr_file_offset": 8, "code_size": 8}]},
        )
        self.assertTrue(mappings[0].size_matches)
        self.assertEqual(mappings[0].retail_file_offset, 8)

    def test_gen1_encounter_scan_requires_decoded_path_and_carries_roster(self) -> None:
        header = bytearray(22)
        header[:2] = bytes.fromhex("88 13")
        header[2:6] = bytes.fromhex("01 01 14 80")
        body = bytes.fromhex("0b 00 07 00 02 00 09 24 00")
        report = gen1_ecl_encounter_scan.scan_block(bytes(header) + body + bytes.fromhex("24 ff"))
        self.assertEqual(len(report["candidates"]), 1)
        candidate = report["candidates"][0]
        self.assertEqual(candidate["combat_vaddr"], 0x801B)
        self.assertEqual([item["value"] for item in candidate["roster"][0]], [7, 2, 9])
        self.assertEqual(candidate["roster_source"], "local-load-monster")

    def test_gen1_encounter_scan_ignores_raw_combat_byte_without_entry_path(self) -> None:
        raw = bytes.fromhex("88 13") + bytes(20) + bytes.fromhex("24 24 24")
        self.assertEqual(gen1_ecl_encounter_scan.scan_block(raw)["candidates"], [])

    def test_gen1_encounter_scan_rejects_contradictory_repeated_condition(self) -> None:
        header = bytearray(22)
        header[:2] = bytes.fromhex("88 13")
        header[2:6] = bytes.fromhex("01 01 14 80")
        body = bytes.fromhex(
            # COMPARE [0x1234],#1; IF_EQ; SAVE; IF_EQ; GOTO combat; EXIT; LOAD_MONSTER; COMBAT
            "03 01 34 12 00 01 16 09 00 00 01 00 20 16 01 01 2b 80 00 "
            "0b 00 07 00 02 00 09 24"
        )
        report = gen1_ecl_encounter_scan.scan_block(bytes(header) + body)
        self.assertEqual(report["candidates"], [])

    def test_gen1_encounter_scan_counts_reachable_bytes_it_cannot_decode(self) -> None:
        # A reachable byte above the shared 0x00-0x40 table used to be swallowed by a bare
        # `continue`, so a scan that stopped early was indistinguishable from one that ran out of
        # code. 0x41 is genuinely reachable in seven of the nine Gen1 titles; it must be counted.
        header = bytearray(22)
        header[:2] = bytes.fromhex("88 13")
        header[2:6] = bytes.fromhex("01 01 14 80")
        report = gen1_ecl_encounter_scan.scan_block(bytes(header) + bytes.fromhex("41 00 01 00 02"))
        self.assertEqual(report["truncated_offsets"], 1)
        self.assertEqual(report["unknown_opcodes"], {"0x41": 1})
        self.assertEqual(report["candidates"], [])

    def test_gen1_encounter_scan_decodes_past_a_profile_extended_opcode(self) -> None:
        # Same bytes, but with Pools' engine-grounded 0x41 = POOLS_AWARD_XP (wordSet 2) supplied:
        # the scan must now continue through it and reach the COMBAT that follows.
        header = bytearray(22)
        header[:2] = bytes.fromhex("88 13")
        header[2:6] = bytes.fromhex("01 01 14 80")
        body = bytes.fromhex("41 00 01 02 f4 01 0b 00 07 00 02 00 09 24 00")
        raw = bytes(header) + body
        blind = gen1_ecl_encounter_scan.scan_block(raw)
        self.assertEqual(blind["truncated_offsets"], 1)
        self.assertEqual(blind["candidates"], [])

        opcodes = gen1_ecl_encounter_scan.opcodes_for_profile("pools-of-darkness")
        seeing = gen1_ecl_encounter_scan.scan_block(
            raw,
            word_sets=gen1_ecl_encounter_scan.word_sets_for_profile("pools-of-darkness"),
            opcodes=opcodes,
        )
        self.assertEqual(seeing["truncated_offsets"], 0)
        self.assertEqual(seeing["unknown_opcodes"], {})
        self.assertEqual(len(seeing["candidates"]), 1)
        self.assertEqual([item["value"] for item in seeing["candidates"][0]["roster"][0]], [7, 2, 9])
        # The frame itself: opcode + two operands, the second a 3-byte word form (0x01f4 = 500).
        instruction = gen1_ecl_encounter_scan.decode_one(raw, 22, opcodes=opcodes)
        assert instruction is not None
        self.assertEqual((instruction.mnemonic, instruction.size), ("POOLS_AWARD_XP", 6))
        self.assertEqual([operand.word for operand in instruction.args], [1, 500])

    def test_gen1_extended_opcodes_do_not_outrun_the_engine_dialects(self) -> None:
        # This scanner must not invent a framing the TypeScript disassembler does not already
        # stand behind, so every entry here has to be backed by that disassembler.
        #
        # WIDENED 2026-09-10, and the widening is a bug fix in the TEST, not a relaxation.
        # It read "every entry here has to appear in an `opcodeOverrides` block there" and
        # searched ONLY `opcodeOverrides`. That is not the disassembler's resolution order.
        # `decodeInstructionAt` and `eclEncode.ts`'s `effectiveWordSet` both resolve
        # `opcodeOverrides?.[op] ?? KRYNN_GEN1_OPCODES[op]`, so an entry in the SHARED BASE
        # TABLE backs a profile just as strongly -- more strongly, in fact, since it is the
        # value every Gen1 dialect inherits by default.
        #
        # It went red on DoK's `0x41`, and the engine was right: `disassemble.ts`'s own
        # ECL_GEN1_SHORT_DOK docblock says `0x41` is "deliberately NOT overridden here: round 34
        # put `0x41: {wordSet: 2}` into the shared base table, so DoK inherits the right value
        # for free and an override would be a free-agreement claim." This test would have forced
        # exactly the redundant override that docblock declines to write -- i.e. it penalised the
        # correct modelling. `opcodes.ts:157` carries
        # `0x41: { wordSet: 2, mnemonic: 'GEN1_AWARD_XP', uncertain: true }`, which is the same
        # wordSet the Python table declares, so there was never any actual two-track drift here.
        #
        # The anti-invention property is PRESERVED, not traded away: the base table is read from
        # its own file and the wordSet must still AGREE, so a Python entry the engine does not
        # model in either place still fails. What is deliberately still NOT accepted is "some
        # override somewhere in disassemble.ts" -- Gen2 declares its own `0x41` wordSet-2
        # override, and a file-wide search would let that satisfy an invented Gen1 entry.
        source = (
            Path(__file__).resolve().parents[1] / "packages/engine/src/ecl/disassemble.ts"
        ).read_text(encoding="utf-8")
        base_table_source = (
            Path(__file__).resolve().parents[1] / "packages/engine/src/ecl/opcodes.ts"
        ).read_text(encoding="utf-8")
        base_table = dict(
            (int(op, 16), int(word_set))
            for op, word_set in re.findall(
                r"^\s*(0x[0-9a-f]{2}): \{ wordSet: (\d+)", base_table_source, re.M
            )
        )
        # Guard the guard: if this regex ever stops matching the table's formatting it would
        # silently accept everything, which is the vacuity this repo keeps rediscovering. The
        # base table is documented as dense over 0x00..0x41.
        self.assertGreaterEqual(len(base_table), 0x42, "base-table parse produced too few rows")
        self.assertEqual(base_table.get(0x41), 2, "base table no longer defines 0x41 as wordSet 2")
        for profile_id, table in gen1_ecl_encounter_scan.PROFILE_EXTENDED_OPCODES.items():
            dialect = gen1_ecl_encounter_scan.PROFILE_DIALECT_NAMES[profile_id]
            const = "ECL_" + dialect.upper().replace("-", "_")
            # Scope the search to that dialect's own declaration. Searching the whole file would
            # let any override anywhere satisfy any profile -- Gen2 also declares an `0x41`
            # wordSet-2 override, so a file-wide check passes even for an invented Gen1 entry.
            def declaration(name: str) -> str:
                found = re.search(
                    rf"^export const {name}: EclDialect = \{{(.*?)^\}};", source, re.S | re.M
                )
                self.assertIsNotNone(found, f"{name} is not declared in disassemble.ts")
                assert found is not None
                return found.group(1)

            body = declaration(const)
            # A dialect may inherit overrides by spreading a base dialect's, so search the base
            # too -- but only the base it actually spreads. Without this the test would reject a
            # legitimately inherited entry; without the "only what it spreads" part it would go
            # back to being satisfiable by any override anywhere in the file.
            for base in re.findall(r"\.\.\.(ECL_[A-Z0-9_]+)\.opcodeOverrides", body):
                body += declaration(base)

            for opcode, spec in table.items():
                needle = f"0x{opcode:02x}: {{ wordSet: {spec.word_set}"
                # Backed by this dialect's own (or its spread base's) override, OR by the shared
                # base table at the SAME wordSet. Either is the engine standing behind the entry.
                self.assertTrue(
                    needle in body or base_table.get(opcode) == spec.word_set,
                    f"{profile_id} 0x{opcode:02x} (wordSet {spec.word_set}) is backed neither by "
                    f"an override inside {const} nor by KRYNN_GEN1_OPCODES in opcodes.ts",
                )

    def test_pool_dispatch_extractor_uses_decoded_cmp_call_pairs(self) -> None:
        raw = bytes.fromhex("55 89 e5 3c 00 e8 07 00 3c 01 e8 03 00 5d cb")
        shape = map_pool_ecl_dispatch.disassemble_shape(raw, 0)
        self.assertIsNotNone(shape)
        assert shape is not None
        self.assertEqual(
            map_pool_ecl_dispatch.dispatch_table(raw, shape),
            [{"opcode": 0, "handler_file_offset": 15}, {"opcode": 1, "handler_file_offset": 16}],
        )

    def test_pool_behavior_cluster_join_preserves_claim_boundaries(self) -> None:
        report = map_pool_behavior_clusters.build_report()
        parser = next(row for row in report["functions"] if row["role"] == "operand_parser")
        commands = {row["opcode"]: row for row in report["replayed_commands"]}
        self.assertTrue(any(row["match_kind"] == "relocation-normalized" for row in parser["clusters"]))
        self.assertEqual(sum(row["call_count"] for row in parser["inbound_vroomm_calls"]), 42)
        self.assertEqual(commands[0x24]["handler_file_offset"], 0x24E1)
        self.assertEqual(commands[0x25]["mapping"], "dispatcher-internal")
        self.assertNotIn("handler_file_offset", commands[0x25])


class ReportNarrowingGuardTests(unittest.TestCase):
    """`report_guard` exists because two checked-in corpus reports were silently destroyed.

    Both losses came from a scope-narrowing run writing over a corpus-wide report: 242 lines of
    `gen1-ecl-natural-encounters.md` (path passed explicitly, from the repo's own documented
    recipe) and 172 lines of `gen1-area-mode-writes.md` (path from the tool's own default). The
    second happened despite a written warning naming that tool and that file, which is why the
    check lives on the write instead of in the instructions. These tests pin the behaviour that
    makes the failure loud.
    """

    def _titles(self) -> list[str]:
        return ["Champions of Krynn", "Pool of Radiance", "Curse of the Azure Bonds"]

    def test_refuses_write_that_drops_titles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.md"
            path.write_text(
                "# report\n| Champions of Krynn | 1 |\n| Pool of Radiance | 0 |\n", encoding="utf-8"
            )
            with self.assertRaises(SystemExit) as caught:
                report_guard.guard_narrowing_write(
                    path, "# report\n| Champions of Krynn | 1 |\n", label="the test report"
                )
            message = str(caught.exception)
            self.assertIn("REFUSING TO WRITE", message)
            self.assertIn("Pool of Radiance", message)  # names what would be lost
            # and the file on disk is untouched
            self.assertIn("Pool of Radiance", path.read_text(encoding="utf-8"))

    def test_allows_regeneration_with_equal_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.md"
            body = "# report\n| Champions of Krynn | 1 |\n| Pool of Radiance | 0 |\n"
            path.write_text(body, encoding="utf-8")
            report_guard.guard_narrowing_write(path, body.replace("| 1 |", "| 7 |"))

    def test_allows_write_that_adds_titles(self) -> None:
        # Gateway going 0 -> 24 sites widened the area-mode report; that must not be blocked.
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.md"
            path.write_text("# report\n| Champions of Krynn | 1 |\n", encoding="utf-8")
            report_guard.guard_narrowing_write(
                path, "# report\n| Champions of Krynn | 1 |\n| Pool of Radiance | 3 |\n"
            )

    def test_allows_first_write_when_file_absent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report_guard.guard_narrowing_write(Path(tmp) / "new.md", "# report\n")

    def test_force_overrides_the_refusal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "report.md"
            path.write_text(
                "# report\n| Champions of Krynn | 1 |\n| Pool of Radiance | 0 |\n", encoding="utf-8"
            )
            report_guard.guard_narrowing_write(
                path, "# report\n| Champions of Krynn | 1 |\n", force=True
            )

    def test_every_report_tool_with_a_narrowing_flag_is_guarded(self) -> None:
        """The guard is only worth having if it is wired into all the tools that can trip it.

        A tool qualifies as hazardous when it BOTH defaults its Markdown output to a checked-in
        doc AND accepts a scope-narrowing flag. Any new such tool must call the guard, or this
        fails and says so -- otherwise the next one added silently reopens the hole.
        """
        tools_dir = Path(__file__).resolve().parent
        unguarded = []
        for path in sorted(tools_dir.glob("*.py")):
            text = path.read_text(encoding="utf-8", errors="replace")
            defaults = re.findall(r'^(DEFAULT_\w+)\s*=\s*REPO_ROOT\s*/\s*"(docs/[^"]+)"', text, re.M)
            if not defaults:
                continue
            if not any(re.search(r"default=" + name, text) for name, _ in defaults):
                continue
            if not re.search(r'add_argument\(\s*"(--profile|--game|--title|--only)"', text):
                continue
            if "guard_narrowing_write" not in text:
                unguarded.append(path.name)
        self.assertEqual(
            unguarded,
            [],
            "these tools write a checked-in report and accept a narrowing flag but do not call "
            "report_guard.guard_narrowing_write(): " + ", ".join(unguarded),
        )


class BundledCatalogCompanions(unittest.TestCase):
    """Every catalog file the viewer fetches must be collected into the production bundle.

    `bundle-assets.mjs` scrapes `catalog.ts` with a regular expression rather than importing
    it, so a new field naming a real file is invisible to it until the pattern is widened.
    That happened on 2026-08-24: `companionPath` did not match the then-bare, case-sensitive
    /path:/, so the six C64 `CHARSET` PRGs were absent from `dist-app` while their pictures
    were present. Every gate stayed green -- the dev server serves the repo directly, and
    only a production build touches the bundler at all.
    """

    def _sources(self):
        root = goldbox_corpus.REPO_ROOT
        catalog = (root / "apps/web/src/ui/catalog.ts").read_text(encoding="utf-8")
        bundler = (root / "apps/web/scripts/bundle-assets.mjs").read_text(encoding="utf-8")
        return catalog, bundler

    def _collector(self, bundler):
        """The bundler's own catalog-scraping regex, translated to Python."""
        m = re.search(r"catalog\.matchAll\(/(.+?)/g\)", bundler)
        self.assertIsNotNone(m, "bundle-assets.mjs no longer scrapes catalog.ts with matchAll")
        return re.compile(m.group(1))

    def test_the_bundler_collects_every_companion_path_the_catalog_names(self):
        catalog, bundler = self._sources()
        wanted = set(re.findall(r"companionPath:\s*'([^']+)'", catalog))
        self.assertGreaterEqual(len(wanted), 3, "no companionPath entries left to protect")
        collected = set(self._collector(bundler).findall(catalog))
        self.assertEqual(
            sorted(wanted - collected),
            [],
            "catalog.ts names these companion files but bundle-assets.mjs would not copy them "
            "into dist-app; widen its catalog regex",
        )

    def test_the_old_bare_path_pattern_would_have_missed_them(self):
        """The null. Without it the test above passes for any regex that matches anything."""
        catalog, _ = self._sources()
        wanted = set(re.findall(r"companionPath:\s*'([^']+)'", catalog))
        missed = wanted - set(re.compile(r"path:\s*'([^']+)'").findall(catalog))
        self.assertEqual(
            sorted(missed),
            sorted(wanted),
            "the pre-fix pattern is expected to miss every companion; if it now catches them "
            "the check above proves nothing",
        )

    def test_companion_files_named_by_the_catalog_exist_on_disk(self):
        catalog, _ = self._sources()
        root = goldbox_corpus.REPO_ROOT
        missing = [
            rel
            for rel in sorted(set(re.findall(r"companionPath:\s*'([^']+)'", catalog)))
            if not (root / rel).is_file()
        ]
        if missing:
            self.skipTest("companion sources are extracted, not vendored: " + ", ".join(missing))



class EngineModuleReachability(unittest.TestCase):
    """Which engine modules has the product no path to at all?

    `tools/sweep_engine_reach.py` walks from the names `apps/` imports out of
    `@goldbox/engine`, follows engine-internal imports, and reports what it never arrives at.
    The name-level half of that sweep takes ~87s and stays a report; this module-level half
    takes ~0.4s, so it can be a gate.

    Being unreached is not automatically a defect -- six of the nine belong to the DOS
    rebuild track, which has no web consumer by design. The point of pinning the set is that
    a TENTH has to be looked at deliberately rather than joining the list unnoticed,
    which is exactly how four solved formats came to be wired to nothing.

    The list went thirteen -> nine on 2026-08-26 by auditing the three entries whose "reason"
    only restated the observation. `./combat/encounterMap.js` ("no web caller yet") was not
    pending at all: it was the 2026-06-23 CT.3 heuristic, superseded on 2026-07-15 by the
    decompile-grounded `coabCombatMap.js` that the app actually calls, so it was deleted rather
    than re-explained. `./loaders/nwnItemVocabulary.js` ("no consumer") had a consumer waiting --
    the NWN preview was counting `MONITM.DAX` blocks while the recovered `GAME.EXE` table sat
    unused -- and wiring it took `./loaders/cokItem.js` off the list too, since `nameFromCodes`
    is what composes the codes. A reason that only says "nothing calls it" is a finding.

    The list shrank by one the day it was written: `./loaders/dqkSave.js` was on it, the whole
    DQK `.QSV` family having decoded and passed its tests for weeks with no caller in `apps/`.
    Wiring the roster view made this test go red on its own, which is the behaviour wanted --
    the pin objects in both directions, not just when something falls off.
    """

    # Each entry needs a reason. "I do not know why this is here" is a finding, not an excuse.
    EXPECTED_UNREACHED = {
        "./combat/combatStepper.js": "combat driver used by tests and the DOS track",
        "./graphics/buildGraphicSet.js": "graphic-set assembly for the DOS rebuild",
        "./loaders/buildDqkDisk.js": "DOS rebuild track: emits a bootable DQK disk",
        "./loaders/buildDqkGame.js": "DOS rebuild track",
        "./loaders/buildDqkItems.js": "DOS rebuild track: ITEMS.DAT writer",
        "./loaders/dqkProtection.js": "copy-protection answering; the web app bypasses it",
        "./loaders/eclAreaIdRemap.js": "DOS rebuild track: area-id remap during ECL porting",
        "./loaders/monchaEncode.js": "DOS rebuild track: MONCHA writer",
        "./ruleset/addnd1e/thiefSkills.js": (
            "blocked, not merely unwired: the race row is the game's Race enum ordinal and "
            "CoK's Dragonlance race set is not that enum. 2026-08-26 narrowed the blocker but did "
            "not clear it -- the field itself is byte-located at save offset 219 and the importer "
            "now carries the stored percentages, so nothing has to COMPUTE them for a shipped "
            "character; the one retail sample fits raceRow 6, which is half_orc in COAB's enum, a "
            "race CoK does not have"
        ),
    }

    def setUp(self):
        import sweep_engine_reach

        self.reach = sweep_engine_reach.module_reachability()

    def test_no_engine_module_falls_off_the_product_unnoticed(self):
        actual = set(self.reach["unreached"])
        expected = set(self.EXPECTED_UNREACHED)
        self.assertEqual(
            sorted(actual - expected),
            [],
            "these engine modules are no longer reachable from any app import; wire them or "
            "add them to EXPECTED_UNREACHED with a reason",
        )
        self.assertEqual(
            sorted(expected - actual),
            [],
            "these are now reachable -- delete them from EXPECTED_UNREACHED so the pin keeps "
            "its teeth",
        )

    def test_the_sweep_reaches_modules_that_only_the_barrel_imports(self):
        """The null, and a real regression the tool shipped with.

        `./loaders/ilbm.js` has no direct app import: the only path is `decodeAsset`, which is
        defined inside `index.ts`. An earlier version of the sweep excluded the barrel from its
        graph and so reported ILBM -- a format the asset browser renders -- as dead code. If
        this ever fails, the sweep's verdicts above are worthless in the same way.
        """
        self.assertNotIn("./loaders/ilbm.js", self.reach["unreached"])
        self.assertNotIn("./loaders/dax.js", self.reach["unreached"])
        self.assertNotIn("./loaders/glib.js", self.reach["unreached"])

    def test_the_sweep_is_not_trivially_reaching_everything(self):
        """The other null. A graph that marks all 184 modules live proves nothing either.

        Following the barrel's `export ... from` lines does exactly that -- it was the first
        thing this tool got wrong, in the opposite direction from the bug above.
        """
        self.assertGreater(len(self.reach["unreached"]), 0)
        self.assertLess(self.reach["reached"], self.reach["total"])
        self.assertGreater(self.reach["seeds"], 50)

if __name__ == "__main__":
    unittest.main()
