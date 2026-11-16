"""Pins `tools/matrix_start_route.py`: Buck Rogers: Matrix Cubed's startup route, derived from the
title's own bytes (GAME.OVR boot selector + archive-name builders, ECL1/GEO1/WALLDEF1/8X8D1 DAX
archives, EXEPACK-unpacked START.EXE). See `docs/engine/research/matrix-cubed-start-route.md`.

Skips (never fails) when the git-ignored `matrixcubed_extracted/` tree is absent, like the other
external-data tests (`test_matrix_cubed_inventory.py`). Every mutation control edits an in-memory
copy; nothing on disk is written.

Why each block of assertions is more than a transcription of the tool's output:
  * the boot ids 16/24 must BOTH be ECL1 blocks -- a random byte pair is (33/256)^2 = 1.7% likely
    to land on two installed blocks; the strict selector shape matches ONCE where the loose
    "two different non-zero stores to one address" shape matches 30 times;
  * all 27 LOAD_FILES sites name a GEO1 block and all 26 LOAD_PIECES sites a WALLDEF1 block --
    against 9.8% / 4.3% per-site chance, so the decode of the operands is itself validated;
  * every mutation below must change or reject the answer, i.e. the answer is read from the
    bytes, not baked into the tool.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from unittest import mock

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import matrix_start_route as msr  # noqa: E402

MATRIX_DIR = msr.find_matrix_dir()
needs_data = unittest.skipUnless(MATRIX_DIR, "Matrix Cubed extraction (matrixcubed_extracted/) absent")

SELECTOR_SITE = 0x3D70
NEW_GAME_IMM = SELECTOR_SITE + 23
DEMO_IMM = SELECTOR_SITE + 11


class _Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if MATRIX_DIR is None:
            raise unittest.SkipTest("Matrix Cubed extraction absent")
        cls.files = msr.load_files(MATRIX_DIR)
        cls.ecl = msr.read_dax(cls.files["ECL1.DAX"])
        cls.geo = msr.read_dax(cls.files["GEO1.DAX"])
        cls.walldef = msr.read_dax(cls.files["WALLDEF1.DAX"])
        cls.d8x8 = msr.read_dax(cls.files["8X8D1.DAX"])
        cls.route = msr.derive_route(cls.files["GAME.OVR"], cls.ecl, cls.geo, cls.walldef, cls.d8x8)

    def derive(self, ovr=None, ecl=None, geo=None, walldef=None, d8x8=None):
        return msr.derive_route(
            ovr if ovr is not None else self.files["GAME.OVR"],
            ecl if ecl is not None else self.ecl,
            geo if geo is not None else self.geo,
            walldef if walldef is not None else self.walldef,
            d8x8 if d8x8 is not None else self.d8x8,
        )

    def patched_ovr(self, offset: int, value: bytes) -> bytes:
        data = bytearray(self.files["GAME.OVR"])
        data[offset:offset + len(value)] = value
        return bytes(data)


class ArchiveFactsTests(_Base):
    def test_archives_are_the_documented_sizes(self):
        self.assertEqual(len(self.files["GAME.OVR"]), 212_529)
        self.assertEqual(self.files["GAME.OVR"][:4], b"FBOV")
        self.assertEqual((len(self.ecl), len(self.geo), len(self.walldef)), (33, 25, 11))
        self.assertTrue(all(len(raw) == 1026 for raw in self.geo.values()))
        self.assertEqual(sorted(self.walldef), sorted(self.d8x8 .keys() - {201, 202}))

    def test_only_area_one_archives_are_installed(self):
        names = {p.name.upper() for p in MATRIX_DIR.iterdir()}
        self.assertEqual({n for n in names if n.startswith(("ECL", "GEO", "WALLDEF"))},
                         {"ECL1.DAX", "GEO1.DAX", "WALLDEF1.DAX"})

    def test_matrix_cfg_marker_and_resident_image(self):
        self.assertTrue(self.files["MATRIX.CFG"].startswith(b"V\r\nS\r\nN\r\nC:\\MATRIX\\SAVE"))
        import exepack_unpack

        resident, _ = exepack_unpack.unpack(MATRIX_DIR / "START.EXE")
        self.assertEqual(len(resident), 75_344)
        # The resident image names the overlay and the profile marker...
        self.assertGreaterEqual(resident.find(b"matrix.cfg"), 0)
        self.assertGreaterEqual(resident.find(b"GAME.OVR"), 0)
        # ...but holds none of the area-archive name builders: they live in GAME.OVR only.
        for literal in msr.NAME_LITERALS.values():
            self.assertEqual(resident.find(literal), -1)
            self.assertEqual(self.files["GAME.OVR"].count(literal), 1)
        # The unpacked image is the whole 4709-paragraph load image, not the 70,277-byte file.
        self.assertGreater(len(resident), len(self.files["START.EXE"]))


class BootSelectorTests(_Base):
    def test_selector_site_and_values(self):
        boot = self.route["boot"]
        self.assertEqual(boot["strict_matches"], 1)
        self.assertEqual(boot["site"], SELECTOR_SITE)
        self.assertEqual((boot["new_game_block"], boot["demo_block"]), (16, 24))
        self.assertEqual(boot["demo_flag_ds"], 0x443A)
        self.assertEqual(boot["ecl_block_var_ds"], 0x8C30)
        self.assertIsNotNone(boot["loader_call_offset"])  # mov al,[var]; push ax; lcall 0x6b:0x34

    def test_imm_offsets_hold_the_ids(self):
        ovr = self.files["GAME.OVR"]
        self.assertEqual(ovr[NEW_GAME_IMM], 16)
        self.assertEqual(ovr[DEMO_IMM], 24)

    def test_discrimination_numbers(self):
        stats = self.route["stats"]
        self.assertEqual(stats["loose_pair_sites"], 30)  # the loose shape is NOT selective
        self.assertAlmostEqual(stats["boot_pair_in_ecl1_chance"], 0.0166, places=4)
        # CoAB's own constants are absent from Matrix: this is not the CoAB selector.
        self.assertEqual(len(re.findall(rb"\xC6\x06..\x52", self.files["GAME.OVR"], re.S)), 0)

    def test_both_boot_blocks_are_installed_and_shaped(self):
        for bid in (16, 24):
            self.assertIn(bid, self.ecl)
        self.assertEqual(len(self.ecl[16]), 33)


class AreaVariableTests(_Base):
    def test_area_variable_and_stores(self):
        arch = self.route["archives"]
        self.assertEqual(arch["area_var_ds"], 0x50D2)
        self.assertEqual(arch["stores_of_1"], 3)
        self.assertEqual(arch["transient6_sites"], [0x89B])
        self.assertEqual(arch["game_area"], 1)
        naming = msr.archive_naming(self.files["GAME.OVR"])
        # Each builder window holds a handful of byte-loads; they intersect in exactly one.
        self.assertEqual(naming["candidate_counts"], {"ECL": 3, "GEO": 1, "WALLDEF": 2})
        self.assertEqual(naming["literal_offsets"], {"ECL": 0x1D384, "GEO": 0x30AA5, "WALLDEF": 0x308BC})


class ChainTests(_Base):
    def test_new_game_chain(self):
        self.assertEqual(self.route["new_game_chain"], [16, 19, 21])
        edges = [(e["from"], e["target"], e["vaddr"]) for e in self.route["chain_edges"]]
        self.assertEqual(edges, [(16, 19, 0x801A), (19, 21, 0x842A), (21, 19, 0x8202)])
        self.assertFalse(self.route["native_smoke_block_34_on_chain"])

    def test_block16_is_save_area_then_newecl(self):
        b16 = self.route["block16"]
        self.assertEqual((b16["instructions"], b16["truncated"]), (2, 0))
        self.assertEqual(b16["area_writes"], [(0x8014, (0, 1))])
        self.assertEqual(self.route["chain_first_instruction"][16], ("SAVE", [(0, 1), (1, msr.GAME_AREA_ECL_ADDR)]))

    def test_start_map_and_wall_set(self):
        sm = self.route["start_map"]
        self.assertEqual((sm["loading_block"], sm["geo_block"], sm["wall_set"]), (19, 17, 5))
        self.assertEqual(sm["load_files_vaddr"], 0x8051)
        self.assertEqual(sm["all_chain_geo_ids"], [17, 21])
        # Block 19 carries two LOAD_FILES sites (first-visit branch 0x8555 and 0x8051); both agree.
        flow19 = msr.flow(self.ecl[19])
        self.assertEqual(sorted({a for a, _ in flow19["load_files"]}), [0x8051, 0x8555])
        self.assertEqual({args[0][1] for _, args in flow19["load_files"]}, {17})
        self.assertEqual({args[0][1] for _, args in flow19["load_pieces"]}, {5})

    def test_demo_block(self):
        self.assertEqual(self.route["demo"], {"block": 24, "geo_block": 64})
        self.assertEqual({a[0][1] for _, a in msr.flow(self.ecl[24])["load_pieces"]}, {7})

    def test_population_statistics(self):
        s = self.route["stats"]
        self.assertEqual((s["load_files_sites"], s["load_files_in_geo1"]), (27, 27))
        self.assertEqual((s["load_pieces_sites"], s["load_pieces_in_walldef1"]), (26, 26))
        self.assertEqual(s["load_files_self_referential"], 21)
        self.assertEqual(s["self_id_guard_blocks"], 22)
        # Chance of 27/27 and 26/26 membership at the per-site null rates is below 1e-26.
        self.assertLess(s["geo1_membership_chance"] ** 27 * s["walldef1_membership_chance"] ** 26, 1e-26)
        # Disclosure: blocks whose static decode still truncates (none is on 16's own path).
        self.assertEqual(s["truncated_by_block"], {18: 8, 19: 12, 20: 16, 95: 4})


class MutationControlTests(_Base):
    """Each control must flip or reject the answer; a probe that cannot fail is not evidence."""

    def test_new_game_id_not_in_ecl1_rejects(self):
        with self.assertRaises(msr.RouteError):
            self.derive(ovr=self.patched_ovr(NEW_GAME_IMM, bytes([15])))

    def test_new_game_id_changes_the_chain(self):
        mutated = self.derive(ovr=self.patched_ovr(NEW_GAME_IMM, bytes([17])))
        self.assertEqual(mutated["new_game_chain"], [17])
        self.assertNotEqual(mutated["new_game_chain"], self.route["new_game_chain"])

    def test_demo_id_is_read_from_its_own_byte(self):
        self.assertEqual(self.derive(ovr=self.patched_ovr(DEMO_IMM, bytes([64])))["demo"]["block"], 64)
        with self.assertRaises(msr.RouteError):
            self.derive(ovr=self.patched_ovr(DEMO_IMM, bytes([25])))

    def test_selector_shape_mutation_rejects(self):
        with self.assertRaises(msr.RouteError):  # EB (jmp) -> NOP: the strict shape no longer matches
            self.derive(ovr=self.patched_ovr(SELECTOR_SITE + 17, b"\x90"))

    def test_blank_overlay_rejects(self):
        with self.assertRaises(msr.RouteError):
            self.derive(ovr=bytes(len(self.files["GAME.OVR"])))

    def test_archive_literal_mutation_rejects(self):
        off = self.route["archives"]["literal_offsets"]["GEO"]
        with self.assertRaises(msr.RouteError):  # 'GEO' -> 'GEX': no unique builder literal remains
            self.derive(ovr=self.patched_ovr(off + 3, b"X"))

    def test_untransient_area6_store_rejects(self):
        # Break the `mov al,[area]` that precedes the area-6 store: it is no longer a save/restore
        # transient, so game_area would have a second permanent value and the route is refused.
        with self.assertRaises(msr.RouteError):
            self.derive(ovr=self.patched_ovr(0x89B - 6, b"\x90"))

    def test_missing_start_map_rejects(self):
        geo = {k: v for k, v in self.geo.items() if k != 17}
        with self.assertRaises(msr.RouteError):
            self.derive(geo=geo)

    def test_short_start_map_rejects(self):
        geo = dict(self.geo)
        geo[17] = geo[17][:1000]
        with self.assertRaises(msr.RouteError):
            self.derive(geo=geo)

    def test_missing_wall_set_rejects(self):
        with self.assertRaises(msr.RouteError):
            self.derive(walldef={k: v for k, v in self.walldef.items() if k != 5})
        with self.assertRaises(msr.RouteError):
            self.derive(d8x8={k: v for k, v in self.d8x8.items() if k != 5})

    def test_block16_newecl_operand_changes_or_rejects(self):
        raw = bytearray(self.ecl[16])
        newecl_at = 0x801A - msr.ECL_BASE
        self.assertEqual(raw[newecl_at], 0x20)
        self.assertEqual(raw[newecl_at + 2], 19)
        raw[newecl_at + 2] = 21
        ecl = dict(self.ecl)
        ecl[16] = bytes(raw)
        self.assertEqual(self.derive(ecl=ecl)["new_game_chain"][:2], [16, 21])
        raw[newecl_at + 2] = 99
        ecl[16] = bytes(raw)
        with self.assertRaises(msr.RouteError):
            self.derive(ecl=ecl)

    def test_removing_block_19_rejects(self):
        with self.assertRaises(msr.RouteError):
            self.derive(ecl={k: v for k, v in self.ecl.items() if k != 19})


class SkipPathTests(unittest.TestCase):
    def test_main_skips_cleanly_without_data(self):
        with mock.patch.object(msr, "find_matrix_dir", return_value=None), mock.patch.object(sys, "argv", ["x"]):
            self.assertEqual(msr.main(), 0)

    def test_find_matrix_dir_ignores_env_without_files(self):
        import os
        import tempfile

        with tempfile.TemporaryDirectory() as empty, mock.patch.dict(os.environ, {"GB_MATRIX_DIR": empty}):
            found = msr.find_matrix_dir()
            self.assertNotEqual(found, Path(empty))


if __name__ == "__main__":
    unittest.main()
