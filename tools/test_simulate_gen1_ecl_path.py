from __future__ import annotations

import unittest

import gen1_ecl_encounter_scan as ecl
import simulate_gen1_ecl_path as subject


def make_block(body: bytes, address_addend: int = ecl.DEFAULT_ADDRESS_ADDEND) -> bytes:
    """Same minimal real-shaped ECL block helper as test_map_gateway_newgame_route.py:
    0x1388 magic + a single `vm_run_1` far pointer landing right after the 22-byte header,
    then the caller's body bytes."""
    raw = bytearray(ecl.ECL_HEADER_LEN)
    raw[0:2] = b"\x88\x13"
    body_offset = ecl.ECL_HEADER_LEN
    vaddr = (body_offset - 2 - address_addend) & 0xFFFF
    raw[2:4] = b"\x01\x01"
    raw[4:6] = vaddr.to_bytes(2, "little")
    return bytes(raw) + body


def vaddr_of(offset: int, address_addend: int = ecl.DEFAULT_ADDRESS_ADDEND) -> int:
    return ecl.offset_to_vaddr(offset, address_addend)


def le16(word: int) -> bytes:
    return bytes([word & 0xFF, (word >> 8) & 0xFF])


class SimulateDynamicGuardTests(unittest.TestCase):
    """COMPARE [addr], 0; IF_NE; GOTO L1 (guarded); EXIT (fallthrough); L1: NEWECL 9."""

    def _raw(self) -> bytes:
        body_offset = ecl.ECL_HEADER_LEN
        goto_offset = body_offset + 6 + 1  # after COMPARE(6) + IF_NE(1)
        exit_offset = goto_offset + 4  # GOTO is 4 bytes
        newecl_offset = exit_offset + 1  # EXIT is 1 byte
        target_vaddr = vaddr_of(newecl_offset)
        body = bytes([0x03, 0x01, 0x00, 0x10, 0x00, 0x00])  # COMPARE [0x1000], 0
        body += bytes([0x17])  # IF_NE
        body += bytes([0x01, 0x01]) + le16(target_vaddr)  # GOTO L1
        body += bytes([0x00])  # EXIT (reached only when the GOTO above is skipped)
        body += bytes([0x20, 0x00, 0x09])  # L1: NEWECL 9
        return make_block(body)

    def test_zero_guard_falls_through_to_exit_not_newecl(self) -> None:
        raw = self._raw()
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {0x1000: 0})
        self.assertEqual(result["status"], "exit")

    def test_nonzero_guard_reaches_newecl(self) -> None:
        raw = self._raw()
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {0x1000: 5})
        self.assertEqual(result["status"], "newecl")
        self.assertEqual(result["target_block"], 9)

    def test_unseeded_location_defaults_to_zero(self) -> None:
        # No host_state entry for 0x1000 at all -- must behave exactly like {0x1000: 0}.
        raw = self._raw()
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {})
        self.assertEqual(result["status"], "exit")


class SimulateSaveMutationTests(unittest.TestCase):
    """SAVE 7 -> [0x2000]; COMPARE [0x2000], 7; IF_EQ; NEWECL 3 (guarded); EXIT (fallthrough).

    Proves a SAVE earlier on the path is visible to a later COMPARE against the same
    location -- i.e. `simulate()` threads a live, mutated host_state through the walk rather
    than reusing the caller's original snapshot."""

    def _raw(self) -> bytes:
        body_offset = ecl.ECL_HEADER_LEN
        compare_offset = body_offset + 6  # after SAVE(6)
        ifeq_offset = compare_offset + 6
        newecl_offset = ifeq_offset + 1
        exit_offset = newecl_offset + 3
        body = bytes([0x09, 0x00, 0x07, 0x01]) + le16(0x2000)  # SAVE 7 -> [0x2000]
        body += bytes([0x03, 0x01]) + le16(0x2000) + bytes([0x00, 0x07])  # COMPARE [0x2000], 7
        body += bytes([0x16])  # IF_EQ
        body += bytes([0x20, 0x00, 0x03])  # NEWECL 3 (guarded)
        body += bytes([0x00])  # EXIT (fallthrough if not equal -- should not be reached)
        return make_block(body)

    def test_save_written_value_is_visible_to_later_compare(self) -> None:
        raw = self._raw()
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {})
        self.assertEqual(result["status"], "newecl")
        self.assertEqual(result["target_block"], 3)
        self.assertEqual(result["host_state"][0x2000], 7)


class SimulateTerminalStateTests(unittest.TestCase):
    def test_return_with_empty_stack_is_a_dead_end(self) -> None:
        raw = make_block(bytes([0x13]))  # RETURN, nothing pushed
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {})
        self.assertEqual(result["status"], "dead-end")

    def test_unresolved_compare_like_opcode_stops_the_walk(self) -> None:
        raw = make_block(bytes([0x1D, 0x00, 0x00]))  # PARTYSTRENGTH (Gen1: 1 operand)
        start = ecl.vaddr_to_offset(vaddr_of(ecl.ECL_HEADER_LEN), ecl.DEFAULT_ADDRESS_ADDEND)
        result = subject.simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start, {})
        self.assertEqual(result["status"], "unresolved-opcode")
        self.assertEqual(result["opcode"], 0x1D)


class GatewayHop1IntegrationTests(unittest.TestCase):
    """Runs against the real, local retail Gateway install. Skips cleanly if not present.

    Proves two corrected findings from `gateway-newgame-route.md`'s 2026-07-17 guard round:

    1. Of Hop 1's two originally-flagged dynamic guards, `[0xC04D]` does NOT gate
       reachability of `NEWECL 21` at all -- both `[0xC04D]==3` and `[0xC04D]!=3` reach
       `NEWECL 21`; the compare only selects which value gets SAVEd to `[0xC04B]` en route
       (4 vs 6), and both branches reconverge before the unconditional continuation.
    2. `[0x7ED5]!=0` alone is NOT sufficient: walking the actual decoded bytes (not the
       doc's own abbreviated "recorded path" table) shows the GOSUB-0x8665 flavor-text
       subroutine itself branches on THREE more dynamic locations (`[0x4C20]`, `[0x4C21]`,
       `[0x4C22]`), and an all-zero-default host state (`[0x4C21]==0`) takes a DIFFERENT
       inner branch (vaddr `0x87ED`, `PICTURE 10`) whose own forced-immediate `COMPARE 0,1`
       makes the outer `[0x84E7]` `IF_NE` TRUE, executing a `GOTO` to a "cancel" path
       (`CALL 0x2E10; SAVE 0xFF -> [0x7EC9]; EXIT`) that never reaches `NEWECL 21`.
       Reaching `NEWECL 21` this way additionally needs `[0x4C21]` to be outside `{0, 1}`."""

    @classmethod
    def setUpClass(cls) -> None:
        try:
            cls.raw = subject.load_ecl2_block1()
        except SystemExit:
            raise unittest.SkipTest("Gateway retail install not present on this machine")
        cls.start = ecl.vaddr_to_offset(0x84D3, ecl.DEFAULT_ADDRESS_ADDEND)

    def test_guard_7ed5_zero_never_reaches_newecl_21(self) -> None:
        result = subject.simulate(self.raw, ecl.DEFAULT_ADDRESS_ADDEND, self.start, {0x7ED5: 0, 0xC04D: 3})
        self.assertNotEqual(result["status"], "newecl")

    def test_all_zero_default_host_state_does_not_reach_newecl_21_even_with_7ed5_nonzero(self) -> None:
        # The literal, all-locations-default-to-0 boot-time guess (only [0x7ED5] seeded
        # nonzero) takes the [0x4C21]==0 "cancel" branch, not NEWECL 21.
        result = subject.simulate(self.raw, ecl.DEFAULT_ADDRESS_ADDEND, self.start, {0x7ED5: 1, 0xC04D: 3})
        self.assertEqual(result["status"], "exit")

    def test_guard_7ed5_nonzero_and_4c21_established_and_c04d_equals_3_reaches_newecl_21(self) -> None:
        result = subject.simulate(
            self.raw, ecl.DEFAULT_ADDRESS_ADDEND, self.start, {0x7ED5: 1, 0xC04D: 3, 0x4C21: 2}
        )
        self.assertEqual(result["status"], "newecl")
        self.assertEqual(result["target_block"], 21)
        self.assertEqual(result["host_state"][0x7F12], 6)  # game_area write proven by map_gateway_newgame_route.py
        self.assertEqual(result["host_state"][0xC04B], 4)  # the [0xC04D]==3 branch's SAVE value

    def test_guard_7ed5_nonzero_and_4c21_established_and_c04d_not_3_still_reaches_newecl_21(self) -> None:
        result = subject.simulate(
            self.raw, ecl.DEFAULT_ADDRESS_ADDEND, self.start, {0x7ED5: 1, 0xC04D: 99, 0x4C21: 2}
        )
        self.assertEqual(result["status"], "newecl")
        self.assertEqual(result["target_block"], 21)
        self.assertEqual(result["host_state"][0x7F12], 6)
        self.assertEqual(result["host_state"][0xC04B], 6)  # the [0xC04D]!=3 branch's SAVE value


if __name__ == "__main__":
    unittest.main()
