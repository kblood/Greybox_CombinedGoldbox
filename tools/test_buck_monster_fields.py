#!/usr/bin/env python3
"""Pins the Buck Rogers: Countdown to Doomsday MON0CHA combat-field offsets.

Record = 263 bytes (the 259-byte XXVc character record with 4 bytes inserted at
~251, see docs/engine/research/buck-record-layout.md).  Every offset below is
below the insertion point, so it is the SAME offset in the 259-byte pregen
`chrdata{n}.sav` and in Matrix Cubed's MON0CHA.DAX.

Derived 2026-10-07 (NATIVE-TASKS item 8, Buck bullet):

    raw[51]  THAC0, stored as 60 - THAC0         (higher byte = better)
    raw[55]  AC,    stored as 60 - AC
    raw[61]  attack-1 dice count   raw[62] attack-2 dice count
    raw[63]  attack-1 dice sides   raw[64] attack-2 dice sides
    raw[65]  attack-1 damage bonus (signed)  raw[66] attack-2 bonus
    raw[60]  attack count (half-attack units, (raw[60]+coin)>>1) -- NOT wired

Two independent kinds of evidence, because either alone fails:

* ORACLE (the Buck GAME.OVR itself).  The character-init routine stores
  raw[0x37]=0x32 (50 = AC 10) and raw[0x33]=0x28 (40 = THAC0 20); the recompute
  routine copies raw[0x33] -> runtime[0xD8] and raw[0x37] -> runtime[0xD9]; the
  sheet prints THAC0 as 60 - runtime[0xD8]; the attack roll hits iff
  d20 + runtime[0xD8] + bonus >= target runtime[0xD9].  The damage setup loop
  copies raw[0x3D..0x42] to runtime[0xDD..0xE2] and the damage roll reads
  count=[0xDC+i], sides=[0xDE+i], bonus=[0xE0+i].  The patterns are located by
  byte search, never by a fixed address, so they survive a re-dump.
* DATA UNIQUENESS SWEEPS over the 54 Buck records (+63 Matrix records and the 6
  pregens where held).  The numbers are pinned with their nulls; a sweep that is
  NOT unique is pinned as non-unique and the oracle carries that field.

Sources are external and never vendored; tests skip when absent.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import dax_decode as dx  # noqa: E402

BUCK_DIR = Path("D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday")


def _find_matrix() -> Path | None:
    rel = Path("matrixcubed_extracted/BuckRogers2/c/Matrix/MON0CHA.DAX")
    for base in [REPO, *REPO.parents]:
        if (base / rel).is_file():
            return base / rel
    return None


MATRIX_MON = _find_matrix()
BUCK_MON = BUCK_DIR / "mon0cha.dax"
BUCK_OVR = BUCK_DIR / "game.ovr"


def _records(path: Path) -> list[bytes]:
    data = path.read_bytes()
    base, blocks = dx.parse_container(data)
    return [dx.decompress_block(data, base, b) for b in blocks]


def _name(rec: bytes) -> str:
    return rec[1:1 + rec[0]].decode("latin1")


def _pregens() -> list[bytes]:
    return [(BUCK_DIR / f"chrdata{i}.sav").read_bytes() for i in range(1, 7)]


# ---------------------------------------------------------------------------
# Oracle: GAME.OVR byte patterns (x86-16, `les di,[bp+x]` then es:[di+disp]).
# ---------------------------------------------------------------------------
ES_STORE_AC = bytes.fromhex("26c6453732")      # mov byte es:[di+37h], 32h  (AC 10)
ES_STORE_THAC0 = bytes.fromhex("26c6453328")   # mov byte es:[di+33h], 28h  (THAC0 20)
# init: both stores are 5 bytes apart-with-reload: store37, les di,[bp-52h], store33
INIT_PAIR = bytes.fromhex("26c6453732c47eae26c6453328")
# recompute: runtime[D8] = raw[33]; runtime[D9] = raw[37]
COPY_THAC0 = bytes.fromhex("268a4533c47ef2268885d800")
COPY_AC = bytes.fromhex("268a4537c47ef2268885d900")
# sheet: THAC0 shown = 60 - runtime[D8]
SHEET_THAC0 = bytes.fromhex("268a85d80030e48bd0b83c002bc2")
# attack roll: d20 + runtime[D8] + bonus >= target's runtime[D9]
TO_HIT = bytes.fromhex("268a85d80030e48bd0a0956998" "03c2" "03c1" "3bc3" "7c04" "c646ff01")
# damage setup loop copies raw[3C+i]->[DC+i], raw[3E+i]->[DE+i], raw[40+i]->[E0+i]
DMG_COPY_COUNT = bytes.fromhex("268a553c" "8a46ff30e4" "c47ef203f8" "268895dc00")
DMG_COPY_SIDES = bytes.fromhex("268a553e" "8a46ff30e4" "c47ef203f8" "268895de00")
DMG_COPY_BONUS = bytes.fromhex("268a5540" "8a46ff30e4" "c47ef203f8" "268895e000")
# damage roll: sides=[DE+i] rolled, then + bonus [E0+i]; count [DC+i] read first
DMG_ROLL_SIDES = bytes.fromhex("268a85de00" "50" "9a4800ee00" "30e48bd0")
DMG_ROLL_BONUS = bytes.fromhex("268a85e000" "98" "03c2")


@unittest.skipUnless(BUCK_OVR.is_file(), "Buck Rogers GAME.OVR (external, never vendored) not present")
class GameOvrOracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.ovr = BUCK_OVR.read_bytes()

    def _once(self, pat: bytes, label: str) -> int:
        n = self.ovr.count(pat)
        self.assertEqual(n, 1, f"{label}: expected exactly one site in GAME.OVR, found {n}")
        return self.ovr.index(pat)

    def test_init_stores_ac_raw_50_and_thac0_raw_40(self) -> None:
        # raw 50/40 = 60-10 / 60-20, i.e. the base-60 convention both fields share.
        self._once(INIT_PAIR, "new-character init stores raw[37h]=50 raw[33h]=40")
        self.assertEqual(60 - 0x32, 10)
        self.assertEqual(60 - 0x28, 20)

    def test_recompute_copies_raw33_and_raw37_to_runtime(self) -> None:
        self._once(COPY_THAC0, "runtime[D8] <- raw[33h]")
        self._once(COPY_AC, "runtime[D9] <- raw[37h]")

    def test_sheet_prints_thac0_as_60_minus_byte(self) -> None:
        self._once(SHEET_THAC0, "THAC0 display = 3Ch - runtime[D8]")

    def test_to_hit_is_roll_plus_thac0_byte_vs_target_ac_byte(self) -> None:
        # d20 + (60-THAC0) + bonus >= (60-AC)  <=>  roll >= THAC0 - AC - bonus.
        self._once(TO_HIT, "attack roll compare against target byte")

    def test_damage_dice_fields_copied_from_raw_3d_to_42(self) -> None:
        # loop index i = 1..2, so raw[3D],raw[3E] / raw[3F],raw[40] / raw[41],raw[42].
        self._once(DMG_COPY_COUNT, "count copy")
        self._once(DMG_COPY_SIDES, "sides copy")
        self._once(DMG_COPY_BONUS, "bonus copy")

    def test_damage_roll_reads_sides_then_adds_bonus(self) -> None:
        self._once(DMG_ROLL_SIDES, "damage roll: roll(sides=[DE+i])")
        self._once(DMG_ROLL_BONUS, "damage roll: + [E0+i] (signed add via cwde)")

    def test_record_size_allocated_is_263_for_the_init_routine_neighbour(self) -> None:
        # mov ax,0103h appears in the allocator immediately before the init stores.
        i = self._once(INIT_PAIR, "init pair")
        self.assertIn(bytes.fromhex("b80301"), self.ovr[i - 0x60:i])


# ---------------------------------------------------------------------------
# Data: uniqueness sweeps + nulls.
# ---------------------------------------------------------------------------
@unittest.skipUnless(BUCK_MON.is_file() and BUCK_OVR.is_file(), "Buck Rogers data (external) not present")
class BuckDataSweepTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.buck = _records(BUCK_MON)
        cls.pregens = _pregens()
        cls.matrix = _records(MATRIX_MON) if MATRIX_MON else []

    def test_corpus_shape(self) -> None:
        self.assertEqual(len(self.buck), 54)
        self.assertTrue(all(len(r) == 263 for r in self.buck))
        self.assertEqual(len(self.pregens), 6)
        self.assertTrue(all(len(p) == 259 for p in self.pregens))

    def test_thac0_byte_unique_by_runtime_link(self) -> None:
        # Null: of the 215 offsets below the runtime block, exactly ONE has
        # runtime[0xD8] - raw[o] in 0..8 for all six pregens (the equipment bonus).
        hits = [o for o in range(1, 216)
                if all(0 <= p[216] - p[o] <= 8 for p in self.pregens)]
        self.assertEqual(hits, [51])

    def test_ac_byte_unique_by_runtime_link(self) -> None:
        hits = [o for o in range(1, 217)
                if all(0 <= p[217] - p[o] <= 10 for p in self.pregens)]
        self.assertEqual(hits, [55])

    def test_thac0_and_ac_bands_are_unique_over_buck_and_matrix(self) -> None:
        pool = self.buck + self.matrix
        th = [o for o in range(1, 251)
              if all(36 <= r[o] <= 56 for r in pool) and len({r[o] for r in self.buck}) >= 4]
        ac = [o for o in range(1, 251)
              if all(45 <= r[o] <= 66 for r in pool) and len({r[o] for r in self.buck}) >= 4]
        self.assertEqual(th, [51])
        self.assertEqual(ac, [55])

    def test_decoded_ranges_are_plausible_thac0_and_ac(self) -> None:
        th = sorted({60 - r[51] for r in self.buck})
        ac = sorted({60 - r[55] for r in self.buck})
        self.assertEqual((min(th), max(th)), (10, 20))
        self.assertEqual((min(ac), max(ac)), (-2, 10))
        # robots/constructs are the low-AC end, humans the AC 10 end
        robots = [60 - r[55] for r in self.buck if "ROBOT" in _name(r) or "BOT" in _name(r)]
        humans = [60 - r[55] for r in self.buck if "WARRIOR" in _name(r)]
        self.assertTrue(robots and humans)
        self.assertLess(sum(robots) / len(robots), sum(humans) / len(humans))
        self.assertEqual(set(humans), {10})

    def test_sides_byte_unique_among_all_nonzero_dice_valued_offsets(self) -> None:
        dice = {2, 3, 4, 6, 8, 10, 12, 20, 100}
        hits = [o for o in range(30, 251) if all(r[o] in dice for r in self.buck)]
        self.assertEqual(hits, [63])
        self.assertEqual(sorted({r[63] for r in self.buck}), [2, 3, 4, 6, 8, 10])

    def test_count_byte_is_NOT_unique_by_data_alone(self) -> None:
        # Honest null: five offsets have every Buck value in {1,2}; the dice count
        # offset is carried by the GAME.OVR copy loop, not by this sweep.
        hits = [o for o in range(30, 251) if all(r[o] in (1, 2) for r in self.buck)]
        self.assertEqual(hits, [61, 76, 212, 213, 215])
        self.assertIn(61, hits)
        self.assertTrue(all(r[61] > 0 for r in self.buck))

    def test_second_attack_count_and_sides_are_coupled(self) -> None:
        # raw[62]>0 <=> raw[64]>0 in all 54 records (6 have a second attack).  The
        # coupling is not unique (22 variable pairs (a,a+2) exist) so it corroborates.
        self.assertEqual([bool(r[62]) for r in self.buck], [bool(r[64]) for r in self.buck])
        self.assertEqual(sum(bool(r[62]) for r in self.buck), 6)
        coupled = [a for a in range(30, 250)
                   if [bool(r[a]) for r in self.buck] == [bool(r[a + 2]) for r in self.buck]
                   and 0 < sum(bool(r[a]) for r in self.buck) < len(self.buck)]
        self.assertEqual(len(coupled), 22)
        self.assertIn(62, coupled)

    def test_bonus_byte_has_no_data_discrimination(self) -> None:
        # raw[65] holds only {0,1,2} in Buck and raw[66] only 0; there is no sweep
        # that can single it out, so it is oracle-pinned only and wired as signed.
        self.assertEqual(sorted({r[65] for r in self.buck}), [0, 1, 2])
        self.assertEqual({r[66] for r in self.buck}, {0})

    def test_hp_mirror_still_holds_for_the_wired_hp_field(self) -> None:
        self.assertTrue(all(r[69] == r[227] and r[69] > 0 for r in self.buck))

    @unittest.skipUnless(MATRIX_MON is not None, "Matrix Cubed extraction not present")
    def test_matrix_cross_check_is_reported_with_its_null(self) -> None:
        # 19 names are shared.  Matrix REBALANCES the same monsters (raw[51] equal in
        # only a few), so exact equality is not the test; closeness is, against a
        # seeded shuffled-pairing null.  Numbers recorded 2026-10-07:
        #   raw[55] within 3: real 16/19 vs null mean ~10.6, max 17 in 2000 trials (WEAK: at the ceiling)
        #   raw[51] within 2: real  9/19 vs null mean  7.9 (max 13)  -- NOT significant
        # i.e. the AC byte corroborates, the THAC0 byte does not (rebalanced): reported, not hidden.
        import random
        first_b: dict[str, bytes] = {}
        first_m: dict[str, bytes] = {}
        for r in self.buck:
            first_b.setdefault(_name(r), r)
        for r in self.matrix:
            first_m.setdefault(_name(r), r)
        names = sorted(set(first_b) & set(first_m))
        self.assertEqual(len(names), 19)
        pairs = [(first_b[n], first_m[n]) for n in names]

        def real(o: int, tol: int) -> int:
            return sum(abs(a[o] - b[o]) <= tol for a, b in pairs)

        def null(o: int, tol: int, trials: int = 2000) -> tuple[float, int]:
            rng = random.Random(20261007)
            tot, mx = 0, 0
            for _ in range(trials):
                ms = [b for _, b in pairs]
                rng.shuffle(ms)
                s = sum(abs(a[o] - b[o]) <= tol for (a, _), b in zip(pairs, ms))
                tot += s
                mx = max(mx, s)
            return tot / trials, mx

        ac_real = real(55, 3)
        ac_mean, ac_max = null(55, 3)
        self.assertEqual(ac_real, 16)
        self.assertGreater(ac_real, ac_mean + 4)
        self.assertLessEqual(ac_max - ac_real, 1)   # at the null's ceiling: weak, stated as weak
        th_real = real(51, 2)
        th_mean, th_max = null(51, 2)
        self.assertEqual(th_real, 9)
        self.assertLess(th_real, th_max)   # not significant: stated, not hidden


if __name__ == "__main__":
    unittest.main()
