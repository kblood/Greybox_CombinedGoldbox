from __future__ import annotations

import collections
import hashlib
import sys
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import gen1_ecl_encounter_scan as scanner
import goldbox_corpus


POOLS_ECL = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\ECL1.DAX")


class PoolsEncounterScannerDialectTests(unittest.TestCase):
    def test_pools_split_is_title_specific_and_matches_typescript_frames(self) -> None:
        pools = scanner.word_sets_for_profile("pools-of-darkness")
        self.assertEqual(
            {opcode: pools[opcode] for opcode in (0x0C, 0x1D, 0x1F, 0x21, 0x22, 0x23, 0x2C, 0x37)},
            {0x0C: 4, 0x1D: 0, 0x1F: 1, 0x21: 2, 0x22: 0, 0x23: 0, 0x2C: 1, 0x37: 2},
        )
        self.assertEqual(scanner.word_sets_for_profile("death-knights-of-krynn")[0x21], 3)
        self.assertEqual(scanner.word_sets_for_profile("treasures-of-the-savage-frontier")[0x21], 2)
        self.assertEqual(scanner.PROFILE_DIALECT_NAMES["pools-of-darkness"], "gen1-short-pools")

        # Exact retail ECL1#69 bytes at raw 0x3c, relocated to the minimum decoder offset.
        raw = bytes(scanner.ECL_HEADER_LEN) + bytes.fromhex(
            "21 00 45 00 05 03 00 12 01 16 00 16 01 01 10 84"
        )
        load_files = scanner.decode_one(raw, scanner.ECL_HEADER_LEN, pools)
        self.assertIsNotNone(load_files)
        self.assertEqual((load_files.opcode, load_files.size), (0x21, 5))
        compare = scanner.decode_one(raw, scanner.ECL_HEADER_LEN + load_files.size, pools)
        self.assertIsNotNone(compare)
        self.assertEqual((compare.opcode, compare.mnemonic, compare.size), (0x03, "COMPARE", 6))

        # The shared DoK frame swallows the real COMPARE opcode as operand three.
        shared = scanner.decode_one(raw, scanner.ECL_HEADER_LEN, scanner.GEN1_SHORT_WORD_SETS)
        self.assertIsNotNone(shared)
        self.assertEqual(shared.size, 8)
        self.assertEqual((shared.args[2].code, shared.args[2].word), (0x03, 0x1200))

        # Exact ECL1#69 inline TRANED lookup: two operands re-land on RETURN.
        lookup_raw = bytes(scanner.ECL_HEADER_LEN) + bytes.fromhex(
            "37 80 05 51 20 4e 14 40 01 a1 00 13"
        )
        lookup = scanner.decode_one(lookup_raw, scanner.ECL_HEADER_LEN, pools)
        self.assertIsNotNone(lookup)
        self.assertEqual((lookup.opcode, lookup.size, len(lookup.args)), (0x37, 11, 2))
        returned = scanner.decode_one(lookup_raw, scanner.ECL_HEADER_LEN + lookup.size, pools)
        self.assertIsNotNone(returned)
        self.assertEqual((returned.opcode, returned.mnemonic), (0x13, "RETURN"))

    @unittest.skipUnless(POOLS_ECL.is_file(), "Pools retail ECL1.DAX is not installed")
    def test_retail_self_identifying_load_files_census(self) -> None:
        data = POOLS_ECL.read_bytes()
        self.assertEqual(
            hashlib.sha256(data).hexdigest(),
            "46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af",
        )
        successors: collections.Counter[str] = collections.Counter()
        sites: list[tuple[int, int]] = []
        pools = scanner.word_sets_for_profile("pools-of-darkness")
        for block in goldbox_corpus.read_dax_blocks(POOLS_ECL):
            raw = block["raw"]
            block_id = block["block_id"]
            for offset in range(scanner.ECL_HEADER_LEN, len(raw)):
                instruction = scanner.decode_one(raw, offset, pools)
                if instruction is None or instruction.opcode != 0x21 or len(instruction.args) != 2:
                    continue
                first, disk = instruction.args
                if first.code != 0 or first.word != block_id or disk.code != 0:
                    continue
                following = scanner.decode_one(raw, offset + instruction.size, pools)
                self.assertIsNotNone(following, f"ECL1#{block_id} raw 0x{offset:x}")
                sites.append((block_id, offset))
                successors[following.mnemonic] += 1

        self.assertEqual(len(sites), 34)
        self.assertEqual(
            successors,
            collections.Counter({"SAVE": 24, "COMPARE": 7, "PARLAY": 1, "GETTABLE": 1, "GOTO": 1}),
        )


if __name__ == "__main__":
    unittest.main()
