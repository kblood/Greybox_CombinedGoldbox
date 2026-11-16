"""Accounting controls for the Gen1 and DQK GBMT menu-capacity censuses."""

from __future__ import annotations

import dqk_ecl_menu_capacity_scan as dqk
import gen1_ecl_menu_capacity_scan as gen1


def test_scanners_include_each_gbmt_length_prefix() -> None:
    # Pool's largest known menu has prompt + three labels: 104 packed bytes
    # become 108 in the 128-byte GBMT store.  Both scanners must count the
    # store, not just the source payload.
    assert gen1.storage_bytes(104, 4) == 108
    assert dqk.storage_bytes(104, 4) == 108


def test_scanners_discriminate_the_gbmt_128_byte_boundary() -> None:
    # A single segment's prefix is enough to change this boundary.  This is a
    # synthetic control for the exact CCECL capture_menu_text comparison.
    assert gen1.storage_bytes(127, 1) == 128
    assert dqk.storage_bytes(127, 1) == 128
    assert gen1.storage_bytes(128, 1) == 129
    assert dqk.storage_bytes(128, 1) == 129
