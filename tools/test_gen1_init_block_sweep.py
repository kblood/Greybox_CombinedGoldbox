"""Pins tools/gen1_init_block_sweep.py against the real GOG Pools of Darkness / Treasures data.

Skips when either install is absent. What it pins, and why each pin can fail:

* Treasures' lowest statically-clean init block is 20 under the short2 dialect, and 20 is NOT clean
  under the plain 3-operand LOAD_FILES frame (the control: the dialect is the cause).
* The statically-clean set contains every block the TypeScript `loadDungeon` bootability sweep found
  (`docs/engine/research/pools-of-darkness-eclinit.md`, `gameData.ts`), so the static rule is no
  stricter than the VM rule it stands in for.
* Pools block 18 (the `gameData.ts` init block) is clean with LOAD_FILES naming GEO 18, entry 22.
* The decoder-derived PCs that `native/ccecl-pools-flow-test.ps1` and
  `native/ccecl-treasures-flow-test.ps1` assert are re-derived here from `decode_one`, so those
  PowerShell constants have an independent source that is not CCECL.
"""
from __future__ import annotations

import pytest

import gen1_ecl_encounter_scan as scan
import gen1_init_block_sweep as sweep

POOLS = "pools-of-darkness"
TREASURES = "treasures-of-the-savage-frontier"
# Blocks the TypeScript loadDungeon sweep reported as reaching a real EXIT.
POOLS_TS_EXITED = [16, 18, 19, 35, 36, 39, 48, 50, 65, 66, 67, 69, 70, 82]
TREASURES_TS_EXITED = [20, 22, 24, 25, 34, 40]

pytestmark = pytest.mark.skipif(
    not all((root / "ECL1.DAX").is_file() and (root / "GEO1.DAX").is_file() for root in sweep.TITLES.values()),
    reason="GOG Pools of Darkness / Treasures installs absent",
)


@pytest.fixture(scope="module")
def results():
    out = {}
    for profile, root in sweep.TITLES.items():
        out[profile] = (sweep.sweep(profile, root), sweep.sweep(profile, root, long_frame=True))
    return out


def clean(table):
    return [k for k, v in table.items() if v["clean"]]


def test_treasures_lowest_clean_block_is_20_and_needs_the_short_frame(results):
    short, long_ = results[TREASURES]
    assert clean(short)[0] == 20
    assert 20 not in clean(long_), "control: the plain 3-operand frame must NOT boot block 20"
    assert short[20]["loadfiles"] == [20]


def test_static_rule_is_no_stricter_than_the_vm_sweep(results):
    for profile, expected in ((POOLS, POOLS_TS_EXITED), (TREASURES, TREASURES_TS_EXITED)):
        short, _ = results[profile]
        missing = [b for b in expected if b not in clean(short)]
        assert not missing, f"{profile}: VM-bootable blocks rejected by the static rule: {missing}"


def test_pools_init_block_18(results):
    short, long_ = results[POOLS]
    assert 18 in clean(short)
    assert short[18]["entry"] == 22 and short[18]["loadfiles"] == [18]
    # Block 16 is the lowest statically clean id with narration but it needs an INPUT_STRING pause;
    # the sweep must not be mistaken for the selection rule (see pools-of-darkness-eclinit.md).
    assert clean(short)[0] < 18


def _next_pcs(profile: str, block: int, start: int, count: int) -> list[int]:
    root = sweep.TITLES[profile]
    raw = sweep.blocks(root / "ECL1.DAX")[block]
    ws, ops = scan.PROFILE_WORD_SETS[profile], scan.opcodes_for_profile(profile)
    pcs, off = [], start
    for _ in range(count):
        pcs.append(off)
        ins = scan.decode_one(raw, off, ws, ops)
        assert ins is not None
        off += ins.size
    return pcs


def test_decoder_pcs_pinned_by_the_powershell_flow_tests():
    # ccecl-pools-flow-test.ps1: LOAD_FILES 0x49 then COMPARE 0x4E then IF_EQ 0x54.
    assert _next_pcs(POOLS, 18, 0x49, 3) == [0x49, 0x4E, 0x54]
    # ccecl-treasures-flow-test.ps1: LOAD_FILES 0x42, SAVE 0x47, SAVE 0x4E, SAVE 0x55, SURPRISE 0x5C.
    assert _next_pcs(TREASURES, 20, 0x42, 5) == [0x42, 0x47, 0x4E, 0x55, 0x5C]


def test_long_frame_would_misframe_the_same_loadfiles():
    """The control for the pins above: with the 3-operand frame the same LOAD_FILES is 7+ bytes."""
    root = sweep.TITLES[POOLS]
    raw = sweep.blocks(root / "ECL1.DAX")[18]
    ws = dict(scan.PROFILE_WORD_SETS[POOLS])
    ws[0x21] = 3
    ins = scan.decode_one(raw, 0x49, ws, scan.opcodes_for_profile(POOLS))
    assert ins is not None and ins.size != 5
