#!/usr/bin/env python3
"""Recover Gateway ECL6#21's dynamic wilderness contract from retail bytes.

This is a static analyzer.  It consumes the extracted ECL block produced by EclDump and can
optionally verify the retail GEO6/8X8D6 archives plus Gateway GAME.OVR host-call and wilderness
renderer handlers.  No emulator or save mutation is involved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import gen1_ecl_encounter_scan as ecl
import goldbox_corpus


EXPECTED_ECL_SHA256 = "a74bf5afe5ad897cc901766bb191cbebb8883be9a729ceee3ee88ce2001adf6a"
EXPECTED_OVR_SHA256 = "c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd"
EXPECTED_GEO6_SHA256 = "e85fc2e7c0416ef4fbc4bb5f7e961d43d86805cbcd3d2cff8c8bf0f373e5c44d"
EXPECTED_8X8D6_SHA256 = "97b199545eedc235c6d7c2e18fdb98c1578ec0a3c2b2a9934a1bedce6886a198"
EXPECTED_8X8D1_SHA256 = "26af43037aafd3490dd6fbd35a8d800a6f23f825df266f776acdbb529ea02548"
WORD_SETS = ecl.GEN1_SHORT_GATEWAY_WORD_SETS
ADDRESS_ADDEND = ecl.DEFAULT_ADDRESS_ADDEND

SUBMAP_ADDR = 0x4C24
X_ADDR = 0xC04B
Y_ADDR = 0xC04C
DIRECTION_ADDR = 0xC04D
WALL_ROOF_ADDR = 0xC04F
CURRENT_TERRAIN_ADDR = 0x4C02
TRIED_EXIT_ADDR = 0x7ED5
ENCOUNTER_COUNTER_ADDR = 0x4C00
ENCOUNTER_SUPPRESS_ADDR = 0x7F80
HOST_RELOAD_SUPPRESS_ADDR = 0x7EC9
ENCOUNTER_THRESHOLD_ADDR = 0x7F79
ENCOUNTER_MONSTER_ID_ADDR = 0x7F79  # same ECL scratch word, reused after the threshold roll
ENCOUNTER_ROLL_ADDR = 0x7F7C
ENCOUNTER_CHOICE_ADDR = 0x7F7A
ENCOUNTER_PICTURE_ADDR = 0x7F7D
ENCOUNTER_COUNT_ADDR = 0x7F7F
ENCOUNTER_SETUP_DISTANCE_ADDR = 0x4C09
CURRENT_CITY_ADDR = 0x4CA1
TRAVEL_MODE_ADDR = 0x4CF5
SELECTED_CHARACTER_INDEX_ADDR = 0x7EB1
PARTY_SIZE_ADDR = 0x7F3E
COMPANION_SCAN_INDEX_ADDR = 0x7F79
SAVED_CHARACTER_INDEX_ADDR = 0x7F7A
SELECTED_CHARACTER_NAME_ADDR = 0x7C00
SELECTED_CHARACTER_ACTIVE_ADDR = 0x7D00

COMPANION_EXIT_GATES = {
    23: ("EREK",),
    26: ("MUTHTUR", "RISHPAL"),
}

ENCOUNTER_DISPATCH_TARGETS = [
    0x8C75, 0x8C75, 0x8C99, 0x8CD1, 0x8D0B, 0x8D0B,
    0x8D0B, 0x8D32, 0x8DE5, 0x8DE5, 0x8C75, 0x8DE5,
    0x8DE5, 0x8DE5, 0x8DE5, 0x8C75, 0x8D69, 0x8CD1,
]
CURRENT_CITY_BY_DESCRIPTOR = [0, 30, 8, 17, 15, 14, 14, 12, 4, 4, 1, 4, 2, 0, 4, 7, 31, 20]

DIRECTIONS = {0: "north", 1: "east", 2: "south", 3: "west"}


@dataclass(frozen=True)
class Pose:
    submap: int
    x: int
    y: int
    direction: int

    def evidence(self) -> dict[str, Any]:
        return {
            "submap": self.submap,
            "x": self.x,
            "y": self.y,
            "direction": self.direction,
            "facing": DIRECTIONS.get(self.direction, f"unknown-{self.direction}"),
        }


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_offset(vaddr: int) -> int:
    return ecl.vaddr_to_offset(vaddr, ADDRESS_ADDEND)


def instruction(raw: bytes, vaddr: int) -> ecl.Instruction:
    decoded = ecl.decode_one(raw, file_offset(vaddr), WORD_SETS)
    if decoded is None:
        raise ValueError(f"failed to decode ECL instruction at 0x{vaddr:04X}")
    return decoded


def instruction_evidence(raw: bytes, vaddr: int) -> dict[str, Any]:
    ins = instruction(raw, vaddr)
    return {
        "vaddr": f"0x{vaddr:04X}",
        "raw": raw[ins.offset : ins.offset + ins.size].hex(),
        "mnemonic": ins.mnemonic,
        "operands": [
            {"code": operand.code, "word": f"0x{operand.word:04X}"} for operand in ins.args
        ],
    }


def assert_instruction(
    raw: bytes,
    vaddr: int,
    mnemonic: str,
    operands: tuple[tuple[int, int], ...],
) -> None:
    ins = instruction(raw, vaddr)
    actual = tuple((operand.code, operand.word) for operand in ins.args)
    if ins.mnemonic != mnemonic or actual != operands:
        raise ValueError(
            f"0x{vaddr:04X}: expected {mnemonic} {operands}, got {ins.mnemonic} {actual}"
        )


def assert_instruction_raw(raw: bytes, vaddr: int, mnemonic: str, expected_hex: str) -> None:
    """Pin an instruction including inline six-bit strings that operand shapes omit."""

    ins = instruction(raw, vaddr)
    actual = raw[ins.offset : ins.offset + ins.size]
    expected = bytes.fromhex(expected_hex)
    if ins.mnemonic != mnemonic or actual != expected:
        raise ValueError(
            f"0x{vaddr:04X}: expected {mnemonic} raw={expected.hex()}, "
            f"got {ins.mnemonic} raw={actual.hex()}"
        )


def transition(pose: Pose) -> Pose | None:
    """Apply the literal six-way transition logic at ECL 0x893D..0x8B2F.

    ``None`` means this invocation reaches the common no-transition exit.  Direction/y guards that
    the native host already makes implicit are intentionally not invented here.
    """

    submap, x, y, direction = pose.submap, pose.x, pose.y, pose.direction
    if submap == 21:
        return Pose(22, 0, y, direction) if direction == 1 else None
    if submap == 22:
        if x == 15 and direction == 1:
            return Pose(23, 0, y, direction)
        if x == 0:
            return Pose(21, 15, y, direction)
        if y != 15 or x < 4:
            return None
        return Pose(25, x - 4, 0, direction)
    if submap == 23:
        if x == 15 and direction == 1:
            return Pose(24, 0, y, direction)
        if x == 0 and direction == 3:
            return Pose(22, 15, y, direction)
        if x < 4:
            return Pose(25, x + 12, 0, direction)
        return Pose(26, x - 4, 0, direction)
    if submap == 24:
        if x == 0 and direction == 3:
            return Pose(23, 15, y, direction)
        return Pose(26, x + 12, 0, direction)
    if submap == 25:
        if x == 15 and direction == 1:
            return Pose(26, 0, y, direction)
        if y != 0:
            return None
        if x < 12:
            return Pose(22, x + 4, 15, direction)
        return Pose(23, x - 12, 15, direction)
    if submap == 26:
        if x == 0 and direction == 3:
            return Pose(25, 15, y, direction)
        if y != 0:
            return None
        if x < 12:
            return Pose(23, x + 4, 15, direction)
        return Pose(24, x - 12, 15, direction)
    return None


def encounter_step(
    *, counter: int, descriptor: int, suppress: int, threshold: int, roll: int | None
) -> dict[str, Any]:
    """Model the exact cooldown/roll gate at 0x8BD6..0x8C1D.

    Gateway RANDOM #100 produces 0..100 inclusive because the native opcode handler increments
    operands below 255 before calling Random(max).  A roll is therefore supplied explicitly.
    """

    if suppress != 0:
        return {"counter": counter, "suppress": 0, "rolled": False, "encounter": False}
    if descriptor >= 18:
        return {"counter": counter, "suppress": 0, "rolled": False, "encounter": False}
    if counter < 3:
        return {"counter": counter + 1, "suppress": 0, "rolled": False, "encounter": False}
    if roll is None or not 0 <= roll <= 100:
        raise ValueError("an eligible encounter check requires a roll in 0..100")
    encounter = roll < threshold
    return {
        "counter": 0 if encounter else counter,
        "suppress": 0,
        "rolled": True,
        "encounter": encounter,
    }


def flee_outcome(roll: int) -> dict[str, Any]:
    """Model ECL6#21's exact ATTACK/FLEE roll at 0x9473..0x949A."""

    if not isinstance(roll, int) or not 0 <= roll <= 100:
        raise ValueError("Gateway ECL6 flee roll must be an integer in 0..100")
    escaped = roll >= 35
    return {
        "roll": roll,
        "escaped": escaped,
        "combat": not escaped,
        "message": "YOU'VE GOTTEN AWAY." if escaped else "YOU ARE UNABLE TO ESCAPE!",
    }


def sundabar_gate(pose: Pose) -> bool:
    return pose.submap == 24 and pose.x == 0 and pose.y == 4 and pose.direction == 3


def sundabar_prompt(choice_index: int) -> dict[str, Any]:
    """Return the CALL-0x080C outcome (menu order is YES=0, NO=1)."""

    if choice_index == 0:
        return {"choice": "YES", "if_eq": False, "game_area": 5, "chain_block": 19}
    if choice_index == 1:
        return {"choice": "NO", "if_eq": True, "game_area": None, "chain_block": None}
    raise ValueError("CALL 0x080C accepts only YES index 0 or NO index 1")


def boat_abandon_outcome(
    travel_mode: int, choice_index: int | None = None
) -> dict[str, Any]:
    """Transcribe the common terrain branch at 0x8373..0x839A.

    The 12-hour ECL clock operation at 0x82DB has already happened when this branch is reached.
    ``ecl-exit`` means the script returns to the movement host; it does not claim, from static ECL
    bytes alone, how that host completes the deferred physical move.
    """

    if not isinstance(travel_mode, int) or not 0 <= travel_mode <= 0xFFFF:
        raise ValueError("Gateway travel mode must be an ECL word in 0..65535")
    base = {
        "travel_mode_before": travel_mode,
        "ecl_clock_hours_before_branch": 12,
    }
    if travel_mode == 0:
        return {
            **base,
            "prompt": False,
            "choice": None,
            "if_eq": True,
            "travel_mode_after": 0,
            "removed_boat": False,
            "continuation": "ecl-exit",
        }
    if choice_index is None:
        return {
            **base,
            "prompt": True,
            "choice": None,
            "if_eq": None,
            "travel_mode_after": travel_mode,
            "removed_boat": False,
            "continuation": "paused-for-host-choice",
        }
    if choice_index == 0:
        return {
            **base,
            "prompt": True,
            "choice": "YES",
            "if_eq": False,
            "travel_mode_after": 0,
            "removed_boat": True,
            "continuation": "ecl-exit",
        }
    if choice_index == 1:
        return {
            **base,
            "prompt": True,
            "choice": "NO",
            "if_eq": True,
            "travel_mode_after": travel_mode,
            "removed_boat": False,
            "continuation": "common-no-transition",
        }
    raise ValueError("ABANDON THE BOAT accepts only YES index 0 or NO index 1")


def companion_exit_gate_order(submap: int) -> tuple[str, ...]:
    """Return the literal pre-remount companion-guard order at 0x892D..0x8939."""

    return COMPANION_EXIT_GATES.get(submap, ())


def companion_exit_outcome(
    *, present: bool, active: bool, choice_index: int | None = None
) -> dict[str, Any]:
    """Model the shared named-companion predicate/removal contract.

    A present but inactive match is removed by the scan helper and returns without presenting the
    active-companion menu.  An active match pauses for CONTINUE/GO BACK; CONTINUE removes it and
    advances to the next guard, while GO BACK preserves it and cancels the boundary continuation.
    """

    if not present:
        return {
            "prompt": False,
            "choice": None,
            "removed": False,
            "continuation": "next-guard",
        }
    if not active:
        return {
            "prompt": False,
            "choice": None,
            "removed": True,
            "continuation": "next-guard",
        }
    if choice_index is None:
        return {
            "prompt": True,
            "choice": None,
            "removed": False,
            "continuation": "paused-for-menu",
        }
    if choice_index == 0:
        return {
            "prompt": True,
            "choice": "CONTINUE",
            "removed": True,
            "continuation": "next-guard",
        }
    if choice_index == 1:
        return {
            "prompt": True,
            "choice": "GO BACK",
            "removed": False,
            "continuation": "common-no-transition",
        }
    raise ValueError("companion exit accepts only CONTINUE index 0 or GO BACK index 1")


def verify_travel_and_companion_exit_guards(raw: bytes) -> dict[str, Any]:
    """Pin the boat and named-companion branches that precede host movement/remount."""

    expected = {
        # Non-edge probes pay the ECL clock before the temporary host probe and terrain dispatch.
        0x82DB: ("ECL_CLOCK", ((0, 12), (0, 3))),
        0x82E0: ("CALL", ((1, 0xC01E),)),
        # Common terrain / boat-abandon branch.
        0x8373: ("COMPARE", ((1, TRAVEL_MODE_ADDR), (0, 0))),
        0x8379: ("IF_EQ", ()),
        0x837A: ("EXIT", ()),
        0x838B: ("CALL", ((1, 0x080C),)),
        0x838F: ("IF_EQ", ()),
        0x8390: ("GOTO", ((1, 0x8B43),)),
        0x8394: ("SAVE", ((0, 0), (1, TRAVEL_MODE_ADDR))),
        0x839A: ("EXIT", ()),
        0x839B: ("EXIT", ()),
        # Deep water permits exactly mode 1; all other words take the message/no-transition tail.
        0x839C: ("COMPARE", ((1, TRAVEL_MODE_ADDR), (0, 1))),
        0x83A2: ("IF_EQ", ()),
        0x83A3: ("EXIT", ()),
        0x83B8: ("GOTO", ((1, 0x8B43),)),
        # tried_to_exit_map runs all three guard entry points before Sundabar and remap dispatch.
        0x892D: ("GOSUB", ((1, 0x8E20),)),
        0x8931: ("GOSUB", ((1, 0x8FC3),)),
        0x8935: ("GOSUB", ((1, 0x8F37),)),
        0x8939: ("GOSUB", ((1, 0x87E3),)),
        # Selector 23 / EREK.
        0x8E20: ("COMPARE", ((1, SUBMAP_ADDR), (0, 23))),
        0x8E28: ("GOSUB", ((1, 0x8EC7),)),
        0x8E2C: ("IF_NE", ()),
        0x8E82: ("PICTURE", ((0, 0x66),)),
        # Shared active-companion choice and removal path.
        0x8E9E: ("COMPARE", ((1, 0x7F7C), (0, 1))),
        0x8EA4: ("IF_EQ", ()),
        0x8EA5: ("GOTO", ((1, 0x8B43),)),
        0x8EA9: ("SAVE", ((0, 0), (1, SELECTED_CHARACTER_NAME_ADDR))),
        0x8EAF: ("SAVE", ((0, 0), (1, SELECTED_CHARACTER_ACTIVE_ADDR))),
        0x8EB5: (
            "ADD",
            ((0, 128), (1, COMPANION_SCAN_INDEX_ADDR), (1, COMPANION_SCAN_INDEX_ADDR)),
        ),
        0x8EBE: ("LOAD_CHARACTER", ((1, COMPANION_SCAN_INDEX_ADDR),)),
        0x8EC2: ("LOAD_CHARACTER", ((1, SAVED_CHARACTER_INDEX_ADDR),)),
        0x8EC6: ("RETURN", ()),
        # EREK scanner and shared active/inactive predicate.
        0x8EC7: (
            "SAVE",
            ((1, SELECTED_CHARACTER_INDEX_ADDR), (1, SAVED_CHARACTER_INDEX_ADDR)),
        ),
        0x8ECE: ("SAVE", ((0, 0), (1, COMPANION_SCAN_INDEX_ADDR))),
        0x8ED4: ("LOAD_CHARACTER", ((1, COMPANION_SCAN_INDEX_ADDR),)),
        0x8EE1: ("IF_EQ", ()),
        0x8EE6: (
            "ADD",
            ((0, 1), (1, COMPANION_SCAN_INDEX_ADDR), (1, COMPANION_SCAN_INDEX_ADDR)),
        ),
        0x8EEF: ("COMPARE", ((1, COMPANION_SCAN_INDEX_ADDR), (1, PARTY_SIZE_ADDR))),
        0x8EF6: ("IF_LT", ()),
        0x8EF7: ("GOTO", ((1, 0x8ED4),)),
        0x8EFB: ("LOAD_CHARACTER", ((1, SAVED_CHARACTER_INDEX_ADDR),)),
        0x8EFF: ("COMPARE", ((0, 0), (0, 1))),
        0x8F04: ("RETURN", ()),
        0x8F05: ("COMPARE", ((1, SELECTED_CHARACTER_ACTIVE_ADDR), (0, 1))),
        0x8F0B: ("IF_EQ", ()),
        0x8F0C: ("GOTO", ((1, 0x8F2D),)),
        0x8F10: ("SAVE", ((0, 0), (1, SELECTED_CHARACTER_NAME_ADDR))),
        0x8F16: ("SAVE", ((0, 0), (1, SELECTED_CHARACTER_ACTIVE_ADDR))),
        0x8F1C: (
            "ADD",
            ((0, 128), (1, COMPANION_SCAN_INDEX_ADDR), (1, COMPANION_SCAN_INDEX_ADDR)),
        ),
        0x8F25: ("LOAD_CHARACTER", ((1, COMPANION_SCAN_INDEX_ADDR),)),
        0x8F2D: ("LOAD_CHARACTER", ((1, SAVED_CHARACTER_INDEX_ADDR),)),
        0x8F31: ("COMPARE", ((0, 0), (0, 0))),
        0x8F36: ("RETURN", ()),
        # Selector 26 / RISHPAL, then MUTHTUR entry (called first by 0x8931).
        0x8F37: ("COMPARE", ((1, SUBMAP_ADDR), (0, 26))),
        0x8F3F: ("GOSUB", ((1, 0x8F88),)),
        0x8F43: ("IF_NE", ()),
        0x8F45: ("PICTURE", ((0, 0x22),)),
        0x8F84: ("GOTO", ((1, 0x8E85),)),
        0x8FC3: ("COMPARE", ((1, SUBMAP_ADDR), (0, 26))),
        0x8FCB: ("GOSUB", ((1, 0x9023),)),
        0x8FCF: ("IF_NE", ()),
        0x8FD1: ("PICTURE", ((0, 0x4D),)),
        0x901F: ("GOTO", ((1, 0x8E85),)),
        # Shared no-transition tail preserves a one-shot SearchLocation suppression.
        0x8B43: ("SAVE", ((0, 0xFF), (1, HOST_RELOAD_SUPPRESS_ADDR))),
        0x8B49: ("SAVE", ((0, 0xFF), (1, ENCOUNTER_SUPPRESS_ADDR))),
        0x8B4F: ("EXIT", ()),
        0x8BD6: ("COMPARE", ((1, ENCOUNTER_SUPPRESS_ADDR), (0, 0))),
        0x8BDC: ("SAVE", ((0, 0), (1, ENCOUNTER_SUPPRESS_ADDR))),
        0x8BE2: ("IF_NE", ()),
        0x8BE3: ("RETURN", ()),
    }
    for vaddr, (mnemonic, operands) in expected.items():
        assert_instruction(raw, vaddr, mnemonic, operands)

    exact_raw = {
        0x837B: (
            "PRINTCLEAR",
            "12800d04204e10f3a050816008f054fc",
        ),
        0x83A4: (
            "PRINTCLEAR",
            "1280115081605c15054a02538143cf80414542e0",
        ),
        0x8E2E: (
            "PRINTCLEAR",
            "12805115214b81350f4138013848121465531538143e01cf8063d25c1484b204c16493878272600c138e3d480c1415858142094e04851c93ce8133e030f3878014e004d04e25405380e14511380d660205310ba7",
        ),
        0x8E85: (
            "HORIZONTAL_MENU",
            "2b017c7f000280060cf39424e54580061cf8020432c0",
        ),
        0x8ED8: ("COMPARE", "0381007c800315214b"),
        0x8F48: (
            "PRINTCLEAR",
            "1280399c980304e38f5201cf8143cf80605280648f36020f345b202058130594ec82704e12030505616035980604d24c66054e4123d414350512e9c0",
        ),
        0x8F99: ("COMPARE", "0381007c80064894c8401300"),
        0x8FD4: (
            "PRINTCLEAR",
            "1280489d42094ec80d6601922453844ec8094e00538060528014e02601014858073ee80804c1ad3d20d38014853a75205c53033cd16024e8142094e040149480f1a050816048504c353ba7",
        ),
        0x9034: ("COMPARE", "0381007c8006355508515480"),
    }
    for vaddr, (mnemonic, expected_hex) in exact_raw.items():
        assert_instruction_raw(raw, vaddr, mnemonic, expected_hex)

    return {
        "travel_mode_address": f"0x{TRAVEL_MODE_ADDR:04X}",
        "boat_abandon": {
            "entry": "0x8373",
            "prompt": "ABANDON THE BOAT?",
            "menu": ["YES", "NO"],
            "menu_call_raw_operand": "0x080C",
            "comparison": "selected index == 1",
            "land_mode": 0,
            "common_terrain_prompt_predicate": "travel mode != 0",
            "yes": "write travel mode 0, then ECL EXIT",
            "no": "retain travel mode, then GOTO 0x8B43",
            "deep_water_allowed_mode": 1,
            "deep_water_rejected_text": "THE WATER IS TOO DEEP.",
            "pre_prompt_clock": {
                "vaddr": "0x82DB",
                "slot": 3,
                "step": 12,
                "occurs_before_temporary_probe_and_prompt": True,
            },
            "movement_after_ecl_exit": "host-owned; not proven by this static ECL branch",
        },
        "companion_exit_guards": {
            "call_order": ["EREK", "MUTHTUR", "RISHPAL", "SUNDABAR"],
            "by_selector": {"23": ["EREK"], "26": ["MUTHTUR", "RISHPAL"]},
            "menu": ["CONTINUE", "GO BACK"],
            "go_back": "GOTO 0x8B43; companion retained",
            "continue": "clear name/active fields, LOAD_CHARACTER index+128, restore selection",
            "inactive_match": "same removal sequence without presenting the menu",
            "party_predicates": {
                "scan_start": 0,
                "scan_limit_address": f"0x{PARTY_SIZE_ADDR:04X}",
                "name_address": f"0x{SELECTED_CHARACTER_NAME_ADDR:04X}",
                "active_address": f"0x{SELECTED_CHARACTER_ACTIVE_ADDR:04X}",
                "active_value": 1,
            },
            "gates": [
                {
                    "name": "EREK",
                    "selector": 23,
                    "picture": 0x66,
                    "prompt": "EREK STOPS AND REFUSES TO GO FORWARD, SAYING 'I CANNOT LEAVE THIS REGION SO LONG AS AMANITAS NEEDS MY HELP.'",
                },
                {
                    "name": "MUTHTUR",
                    "selector": 26,
                    "picture": 0x4D,
                    "prompt": "'THIS, MY FRIENDS, IS AS FAR AS I DARE GO. HALF-ORCS AREN'T WELCOME IN THIS PART OF THE REALMS.'",
                },
                {
                    "name": "RISHPAL",
                    "selector": 26,
                    "picture": 0x22,
                    "prompt": "'I CANNOT GO TOO FAR FROM HOME, HE SAYS, 'AND LEAVE MY FAMILY UNPROTECTED.'",
                },
            ],
        },
        "no_transition_suppression": {
            "tail": "0x8B43",
            "writes": {
                f"0x{HOST_RELOAD_SUPPRESS_ADDR:04X}": 0xFF,
                f"0x{ENCOUNTER_SUPPRESS_ADDR:04X}": 0xFF,
            },
            "next_search_location": "0x8BD6 compares [0x7F80], clears it at 0x8BDC, and returns when the old value was nonzero",
            "persistence_contract": "retain the 0x7F80 one-shot across a declined/blocked prompt until the next SearchLocation call",
        },
        "anchors": [instruction_evidence(raw, vaddr) for vaddr in expected] + [
            instruction_evidence(raw, vaddr) for vaddr in exact_raw
        ],
    }


def wilderness_tile_route(terrain: int, submap: int) -> dict[str, int]:
    """Resolve a GEO6 plane-0 byte exactly as Gateway's Put8x8Symbol call does."""

    if not 0 <= terrain < 210:
        raise ValueError("Gateway wilderness terrain symbols are restricted to 0..209")
    if not 21 <= submap <= 26:
        raise ValueError("Gateway ECL6 wilderness submap must be 21..26")
    symbol_set = terrain // 70 + 1
    block_id = (18, submap * 2 + 8, submap * 2 + 9)[symbol_set - 1]
    return {
        "global_symbol": 0x2E + terrain,
        "symbol_set": symbol_set,
        "block_id": block_id,
        "local_tile": terrain % 70,
    }


def wilderness_arrow_route(facing_ordinal: int) -> dict[str, int]:
    """Resolve ECL's cardinal facing ordinal to Gateway's persistent boot/UI arrow tile."""

    if not 0 <= facing_ordinal <= 3:
        raise ValueError("Gateway cardinal facing ordinal must be 0..3")
    return {
        "global_symbol": 0x100 + facing_ordinal,
        "symbol_set": 4,
        "archive_area": 1,
        "block_id": 202,
        "local_tile": facing_ordinal,
    }


def table_bytes(raw: bytes, vaddr: int, count: int) -> list[int]:
    start = file_offset(vaddr)
    values = list(raw[start : start + count])
    if len(values) != count:
        raise ValueError(f"ECL table at 0x{vaddr:04X} is truncated: expected {count}, got {len(values)}")
    return values


def verify_wandering_encounter(raw: bytes) -> dict[str, Any]:
    """Verify and report ECL6#21's complete wandering encounter/tactical handoff arm."""

    expected = {
        0x8136: ("SAVE", ((0, 0), (1, ENCOUNTER_COUNTER_ADDR))),
        0x813C: ("CLEARMONSTERS", ()),
        0x813D: ("RANDOM", ((0, 1), (1, ENCOUNTER_SETUP_DISTANCE_ADDR))),
        0x8143: (
            "ADD",
            ((0, 1), (1, ENCOUNTER_SETUP_DISTANCE_ADDR), (1, ENCOUNTER_SETUP_DISTANCE_ADDR)),
        ),
        0x81A8: ("RANDOM", ((0, 4), (1, ENCOUNTER_COUNT_ADDR))),
        0x81AE: ("ADD", ((0, 2), (1, ENCOUNTER_COUNT_ADDR), (1, ENCOUNTER_COUNT_ADDR))),
        0x81B7: ("GOSUB", ((1, 0x8C2D),)),
        0x81CB: ("GOSUB", ((1, 0x944D),)),
        0x81CF: ("GOSUB", ((1, 0x8B62),)),
        0x81D3: (
            "SETUP_MONSTER",
            ((0, 255), (1, ENCOUNTER_SETUP_DISTANCE_ADDR), (0, 255)),
        ),
        0x81DB: (
            "LOAD_MONSTER",
            ((1, ENCOUNTER_MONSTER_ID_ADDR), (1, ENCOUNTER_COUNT_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x81E5: ("COMBAT", ()),
        0x81E6: ("EXIT", ()),
        0x8B62: ("SAVE", ((0, 0), (1, CURRENT_CITY_ADDR))),
        0x8B79: (
            "GETTABLE",
            ((1, 0x8B50), (1, CURRENT_TERRAIN_ADDR), (1, CURRENT_CITY_ADDR)),
        ),
        0x8C2D: ("COMPARE", ((1, CURRENT_TERRAIN_ADDR), (0, 17))),
        0x8C75: ("SAVE", ((0, 6), (1, ENCOUNTER_MONSTER_ID_ADDR))),
        0x8C7B: ("SAVE", ((0, 82), (1, ENCOUNTER_PICTURE_ADDR))),
        0x8C89: ("RANDOM", ((0, 2), (1, ENCOUNTER_COUNT_ADDR))),
        0x8C8F: ("ADD", ((0, 1), (1, ENCOUNTER_COUNT_ADDR), (1, ENCOUNTER_COUNT_ADDR))),
        0x8C99: ("RANDOM", ((0, 1), (1, ENCOUNTER_ROLL_ADDR))),
        0x8C9F: (
            "GETTABLE",
            ((1, 0x8CCD), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x8CA9: (
            "GETTABLE",
            ((1, 0x8CCF), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_PICTURE_ADDR)),
        ),
        0x8CD1: ("RANDOM", ((0, 1), (1, ENCOUNTER_ROLL_ADDR))),
        0x8CD7: (
            "GETTABLE",
            ((1, 0x8D07), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x8CE1: (
            "GETTABLE",
            ((1, 0x8D09), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_PICTURE_ADDR)),
        ),
        0x8D16: ("SAVE", ((0, 51), (1, ENCOUNTER_MONSTER_ID_ADDR))),
        0x8D1C: ("SAVE", ((0, 88), (1, ENCOUNTER_PICTURE_ADDR))),
        0x8D22: ("RANDOM", ((0, 1), (1, ENCOUNTER_COUNT_ADDR))),
        0x8D28: ("ADD", ((0, 2), (1, ENCOUNTER_COUNT_ADDR), (1, ENCOUNTER_COUNT_ADDR))),
        0x8D32: ("RANDOM", ((0, 1), (1, ENCOUNTER_ROLL_ADDR))),
        0x8D38: (
            "GETTABLE",
            ((1, 0x8D65), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x8D42: (
            "GETTABLE",
            ((1, 0x8D67), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_PICTURE_ADDR)),
        ),
        0x8D69: ("RANDOM", ((0, 1), (1, ENCOUNTER_ROLL_ADDR))),
        0x8D6F: (
            "GETTABLE",
            ((1, 0x8DA0), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x8D79: (
            "GETTABLE",
            ((1, 0x8DA2), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_PICTURE_ADDR)),
        ),
        0x8DE5: ("RANDOM", ((0, 1), (1, ENCOUNTER_ROLL_ADDR))),
        0x8DEB: (
            "GETTABLE",
            ((1, 0x8E1C), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_MONSTER_ID_ADDR)),
        ),
        0x8DF5: (
            "GETTABLE",
            ((1, 0x8E1E), (1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_PICTURE_ADDR)),
        ),
        0x945F: ("COMPARE", ((1, ENCOUNTER_CHOICE_ADDR), (0, 0))),
        0x9466: ("RETURN", ()),
        0x9467: ("SAVE", ((0, 1), (1, 0x7ECB))),
        0x946D: ("SAVE", ((0, 0), (1, ENCOUNTER_SETUP_DISTANCE_ADDR))),
        0x9473: ("RANDOM", ((0, 100), (1, ENCOUNTER_CHOICE_ADDR))),
        0x9479: ("COMPARE", ((1, ENCOUNTER_CHOICE_ADDR), (0, 35))),
        0x947F: ("IF_LT", ()),
        0x9480: ("GOTO", ((1, 0x9432),)),
        0x9496: ("CALL", ((1, 0x2E10),)),
        0x949A: ("EXIT", ()),
    }
    for vaddr, (mnemonic, operands) in expected.items():
        assert_instruction(raw, vaddr, mnemonic, operands)

    dispatch_operands = (
        (1, CURRENT_TERRAIN_ADDR),
        (0, len(ENCOUNTER_DISPATCH_TARGETS)),
        *((1, target) for target in ENCOUNTER_DISPATCH_TARGETS),
    )
    assert_instruction(raw, 0x8C38, "ON_GOTO", dispatch_operands)

    # The operand decoder preserves inline-string lengths, not decoded text. Pin the complete retail
    # instruction bytes so ATTACK/FLEE cannot silently drift while retaining the same operand shapes.
    menu = instruction(raw, 0x944D)
    menu_raw = raw[menu.offset : menu.offset + menu.size]
    expected_menu_raw = bytes.fromhex("2b017a7f000280050545010cb0800318c145")
    if menu.mnemonic != "HORIZONTAL_MENU" or menu_raw != expected_menu_raw:
        raise ValueError("unexpected ATTACK/FLEE menu instruction at 0x944D")

    tables = {
        "current_city": (0x8B50, CURRENT_CITY_BY_DESCRIPTOR),
        "goblin_bug_bear_monsters": (0x8CCD, [8, 19]),
        "goblin_bug_bear_pictures": (0x8CCF, [255, 255]),
        "giant_snake_ettin_monsters": (0x8D07, [40, 57]),
        "giant_snake_ettin_pictures": (0x8D09, [85, 86]),
        "troll_basilisk_monsters": (0x8D65, [41, 33]),
        "troll_basilisk_pictures": (0x8D67, [13, 255]),
        "giant_lizard_wyvern_monsters": (0x8DA0, [21, 45]),
        "giant_lizard_wyvern_pictures": (0x8DA2, [91, 92]),
        "wild_boar_hobgoblin_monsters": (0x8E1C, [24, 9]),
        "wild_boar_hobgoblin_pictures": (0x8E1E, [95, 96]),
    }
    for name, (vaddr, values) in tables.items():
        actual = table_bytes(raw, vaddr, len(values))
        if actual != values:
            raise ValueError(f"unexpected {name} table at 0x{vaddr:04X}: {actual}")
    table_report = {
        name: {"vaddr": f"0x{vaddr:04X}", "values": values}
        for name, (vaddr, values) in tables.items()
    }

    families = [
        {
            "family": "anhkheg",
            "descriptors": [0, 1, 10, 15],
            "monster_ids": [6],
            "encounter_picture_ids": [82],
            "count_domain_inclusive": [1, 3],
        },
        {
            "family": "goblin-or-bugbear",
            "descriptors": [2],
            "monster_ids": [8, 19],
            "encounter_picture_ids": [255, 255],
            "count_domain_inclusive": [2, 6],
        },
        {
            "family": "giant-snake-or-ettin",
            "descriptors": [3, 17],
            "monster_ids": [40, 57],
            "encounter_picture_ids": [85, 86],
            "count_domain_inclusive": [2, 6],
        },
        {
            "family": "hill-giant",
            "descriptors": [4, 5, 6],
            "monster_ids": [51],
            "encounter_picture_ids": [88],
            "count_domain_inclusive": [2, 3],
        },
        {
            "family": "troll-or-basilisk",
            "descriptors": [7],
            "monster_ids": [41, 33],
            "encounter_picture_ids": [13, 255],
            "count_domain_inclusive": [2, 6],
        },
        {
            "family": "wild-boar-or-hobgoblin",
            "descriptors": [8, 9, 11, 12, 13, 14],
            "monster_ids": [24, 9],
            "encounter_picture_ids": [95, 96],
            "count_domain_inclusive": [2, 6],
        },
        {
            "family": "giant-lizard-or-wyvern",
            "descriptors": [16],
            "monster_ids": [21, 45],
            "encounter_picture_ids": [91, 92],
            "count_domain_inclusive": [2, 6],
        },
    ]

    failures = [roll for roll in range(101) if not flee_outcome(roll)["escaped"]]
    successes = [roll for roll in range(101) if flee_outcome(roll)["escaped"]]
    return {
        "addresses": {
            "encounter_arm": "0x8136",
            "monster_family_dispatch": "0x8C38",
            "attack_flee_menu": "0x944D",
            "current_city_load": "0x8B79",
            "setup_monster": "0x81D3",
            "load_monster": "0x81DB",
            "combat": "0x81E5",
            "post_combat_exit": "0x81E6",
        },
        "tables": table_report,
        "current_city_by_descriptor": CURRENT_CITY_BY_DESCRIPTOR,
        "descriptor_dispatch_targets": [f"0x{target:04X}" for target in ENCOUNTER_DISPATCH_TARGETS],
        "families": families,
        "two_way_family_selection_domain_inclusive": [0, 1],
        "default_count_domain_inclusive": [2, 6],
        "attack_setup_distance_domain_inclusive": [1, 2],
        "failed_flee_setup_distance": 0,
        "combat_cpic_id": "selected monster id",
        "flee": {
            "roll_domain_inclusive": [0, 100],
            "failure_predicate": "roll < 35",
            "failure_rolls_inclusive": [failures[0], failures[-1]],
            "failure_outcomes": len(failures),
            "success_predicate": "roll >= 35",
            "success_rolls_inclusive": [successes[0], successes[-1]],
            "success_outcomes": len(successes),
            "total_outcomes": 101,
        },
        "anchors": [instruction_evidence(raw, vaddr) for vaddr in expected] + [
            instruction_evidence(raw, 0x8C38),
            instruction_evidence(raw, 0x944D),
        ],
    }


def verify_ecl(raw: bytes) -> dict[str, Any]:
    digest = sha256(raw)
    if digest != EXPECTED_ECL_SHA256:
        raise ValueError(f"unexpected ECL6#21 SHA-256: {digest}")

    expected = {
        0x8094: ("LOAD_FILES", ((1, SUBMAP_ADDR), (0, 2), (0, 255))),
        0x809C: ("ADD", ((1, SUBMAP_ADDR), (1, SUBMAP_ADDR), (1, 0x7F79))),
        0x821F: ("COMPARE", ((1, SUBMAP_ADDR), (0, 24))),
        0x8294: ("COMPARE", ((1, TRIED_EXIT_ADDR), (0, 0))),
        0x82DB: ("ECL_CLOCK", ((0, 12), (0, 3))),
        0x82E4: ("AND", ((1, WALL_ROOF_ADDR), (0, 127), (1, 0x7F7B))),
        0x8323: ("AND", ((1, WALL_ROOF_ADDR), (0, 127), (1, CURRENT_TERRAIN_ADDR))),
        0x893D: ("SUBTRACT", ((0, 21), (1, SUBMAP_ADDR), (1, 0x7F79))),
        0x8BD6: ("COMPARE", ((1, ENCOUNTER_SUPPRESS_ADDR), (0, 0))),
        0x8BEC: ("COMPARE", ((1, ENCOUNTER_COUNTER_ADDR), (0, 3))),
        0x8C0B: ("RANDOM", ((0, 100), (1, ENCOUNTER_ROLL_ADDR))),
        0x8C11: ("COMPARE", ((1, ENCOUNTER_ROLL_ADDR), (1, ENCOUNTER_THRESHOLD_ADDR))),
        0x87E3: ("COMPARE", ((1, SUBMAP_ADDR), (0, 24))),
        0x87EB: ("COMPARE", ((1, X_ADDR), (0, 0))),
        0x87F3: ("COMPARE", ((1, Y_ADDR), (0, 4))),
        0x87FB: ("COMPARE", ((1, DIRECTION_ADDR), (0, 3))),
        0x8812: ("CALL", ((1, 0x080C),)),
        0x881E: ("SAVE", ((0, 5), (1, 0x7F12))),
        0x8824: ("NEWECL", ((0, 19),)),
    }
    for vaddr, (mnemonic, operands) in expected.items():
        assert_instruction(raw, vaddr, mnemonic, operands)

    threshold_start = file_offset(0x8BC4)
    thresholds = list(raw[threshold_start : threshold_start + 18])
    if thresholds != [7, 0, 15, 30, 20, 0, 0, 25, 5, 6, 6, 0, 6, 0, 0, 6, 35, 35]:
        raise ValueError(f"unexpected encounter threshold table: {thresholds}")

    terrain_targets = [
        0x8373, 0x839C, 0x8373, 0x8373, 0x8373, 0x8373,
        0x83BC, 0x8373, 0x8373, 0x8373, 0x839C, 0x8373,
        0x839B, 0x8373, 0x8373, 0x839B, 0x8373, 0x839B,
    ]
    travel_and_exit_guards = verify_travel_and_companion_exit_guards(raw)

    return {
        "path": None,
        "size": len(raw),
        "sha256": digest,
        "anchors": [instruction_evidence(raw, vaddr) for vaddr in expected],
        "host_addresses": {
            "current_submap_geo_block": f"0x{SUBMAP_ADDR:04X}",
            "x": f"0x{X_ADDR:04X}",
            "y": f"0x{Y_ADDR:04X}",
            "direction_ordinal": f"0x{DIRECTION_ADDR:04X}",
            "wall_roof_descriptor": f"0x{WALL_ROOF_ADDR:04X}",
            "tried_to_exit_map": f"0x{TRIED_EXIT_ADDR:04X}",
            "encounter_counter": f"0x{ENCOUNTER_COUNTER_ADDR:04X}",
            "encounter_suppress_once": f"0x{ENCOUNTER_SUPPRESS_ADDR:04X}",
            "travel_mode": f"0x{TRAVEL_MODE_ADDR:04X}",
        },
        "encounters": {
            "eligible_descriptors": "0..17",
            "cooldown_eligible_searches": 3,
            "roll_domain": "0..100 inclusive",
            "trigger": "roll < threshold",
            "thresholds_by_descriptor": thresholds,
            "wandering_handoff": verify_wandering_encounter(raw),
        },
        "dynamic_loads": [
            {
                "submap": block_id,
                "geo_block": block_id,
                "load_files_operands": [block_id, 2, 255],
                "load_pieces_operands": [18, block_id * 2 + 8, block_id * 2 + 9],
            }
            for block_id in range(21, 27)
        ],
        "terrain_probe": {
            "scratch_descriptor": "0x7F7B = [0xC04F] & 0x7F",
            "targets_0_through_17": [f"0x{target:04X}" for target in terrain_targets],
            "mountains_code": 6,
            "deep_water_codes": [1, 10],
            "direct_exit_codes": [12, 15, 17],
            "location_code_base": 115,
            "sundabar_location_code": 120,
        },
        "travel_and_exit_guards": travel_and_exit_guards,
    }


def verify_ovr(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    digest = sha256(raw)
    if digest != EXPECTED_OVR_SHA256:
        raise ValueError(f"unexpected Gateway GAME.OVR SHA-256: {digest}")
    anchors = {
        "random_operand_increment_below_ff": (
            0x0CEB,
            bytes.fromhex("80 7E FF FF 73 03 FE 46 FF"),
        ),
        "routine_id_subtract_7fff": (0x3C31, bytes.fromhex("2D FF 7F")),
        "yes_no_menu_pascal_string": (0x3BFF, bytes.fromhex("08 7E 59 65 73 20 7E 4E 6F")),
        "dispatch_routine_880d": (0x3D43, bytes.fromhex("3D 0D 88 74 03 E9 8D 00")),
        "store_menu_selection": (0x3D8F, bytes.fromhex("30 E4 C4 3E 6C 5D 26 89 85 F2 06")),
        "compare_selection_with_one": (
            0x3DC3,
            bytes.fromhex("C4 3E 6C 5D 26 FF B5 F2 06 B8 01 00 50 9A 75 00 53 00"),
        ),
        # Opcode 0x37 reaches the common loader, whose wilderness branch checks area.inDungeon
        # at +0x1CC.  Zero bypasses WALLDEF construction/decoding and calls Load8x8D(set,id).
        "load_pieces_handler": (0x1898, bytes.fromhex("55 89 E5 B8 06 00")),
        "pieces_calls_load_walldef_wrapper": (0x1925, bytes.fromhex("9A 3E 00 23 01")),
        "wilderness_bypasses_walldef": (
            0x484A9,
            bytes.fromhex("26 83 BD CC 01 00 75 3C 8A 46 08 50 8A 46 06 50 9A 25 00 46 01"),
        ),
        # Draw3dWorld makes the same inDungeon test and selects the dedicated 11x11 map renderer.
        "wilderness_renderer_dispatch": (
            0x47C3B,
            bytes.fromhex("26 83 BD CC 01 00 75 13 8A 46 0A 50 8A 46 08 50 8A 46 06 50 0E E8 25 F5"),
        ),
        # The wilderness loop reads GEO plane 0, adds global symbol base 0x2E, then blits it.
        "terrain_symbol_add_2e": (0x47241, bytes.fromhex("8B 46 F6 05 2E 00 50")),
        # The party marker is an overlay from boot set 4: 0x100 + (native direction >> 1).
        "party_arrow_symbol": (
            0x47285,
            bytes.fromhex("8A 46 06 30 E4 D1 E8 05 00 01 50 B0 01 50 B0 01 50"),
        ),
        # Load8x8D constructs the area-local archive stem "8x8d" + game_area.
        "load8x8d_archive_stem": (0x4C94A, bytes.fromhex("04 38 78 38 64")),
        "boot_set4_block202": (
            0x116E4,
            bytes.fromhex("B0 CA 50 B0 04 50 9A 25 00 46 01"),
        ),
    }
    for name, (offset, expected) in anchors.items():
        if raw[offset : offset + len(expected)] != expected:
            raise ValueError(f"Gateway GAME.OVR anchor drift: {name} at 0x{offset:X}")
    return {
        "path": str(path),
        "size": len(raw),
        "sha256": digest,
        "handler_file_offset": "0x3C08",
        "random_handler_file_offset": "0x0CCA",
        "routine_id": "0x880D (raw operand 0x080C minus 0x7FFF)",
        "menu": ["YES", "NO"],
        "comparison": "selected index == 1",
        "load_pieces": {
            "handler_file_offset": "0x1898",
            "wrapper_file_offset": "0x4846E",
            "in_dungeon_field_offset": "0x1CC",
            "wilderness_branch": "Load8x8D(symbol_set, operand) directly; no WALLDEF read",
        },
        "wilderness_renderer": {
            "file_offset": "0x47178",
            "viewport": "11x11 GEO plane-0 cells",
            "terrain_symbol": "0x2E + cell byte",
            "party_symbol": "0x100 + (native direction >> 1), overlay enabled",
            "terrain_symbol_ranges": ["set1:0x2E..0x73", "set2:0x74..0xB9", "set3:0xBA..0xFF"],
            "terrain_local_index": "cell byte % 70; set = 1 + floor(cell byte / 70)",
            "arrow_bank": "8X8D1.DAX block 202, set 4; local tile = ECL facing ordinal 0..3",
        },
        "anchors": {name: f"GAME.OVR+0x{offset:X}" for name, (offset, _) in anchors.items()},
    }


def verify_geo6(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    digest = sha256(raw)
    if digest != EXPECTED_GEO6_SHA256:
        raise ValueError(f"unexpected Gateway GEO6.DAX SHA-256: {digest}")
    blocks = {block["block_id"]: block["raw"] for block in goldbox_corpus.read_dax_blocks(path)}
    result = []
    for block_id in range(21, 27):
        data = blocks.get(block_id)
        if data is None:
            raise ValueError(f"GEO6.DAX is missing dynamic wilderness block {block_id}")
        terrain = data[2:258]
        if len(terrain) != 256 or max(terrain) >= 210:
            raise ValueError(f"GEO6 block {block_id} plane 0 exceeds direct symbol range 0..209")
        result.append(
            {
                "block_id": block_id,
                "size": len(data),
                "sha256": sha256(data),
                "plane0_min": min(terrain),
                "plane0_max": max(terrain),
            }
        )
    return {"path": str(path), "size": len(raw), "sha256": digest, "blocks": result}


def verify_8x8d6(path: Path) -> dict[str, Any]:
    """Verify the thirteen direct 70-tile banks consumed by ECL6#21."""

    raw = path.read_bytes()
    digest = sha256(raw)
    if digest != EXPECTED_8X8D6_SHA256:
        raise ValueError(f"unexpected Gateway 8X8D6.DAX SHA-256: {digest}")
    blocks = {block["block_id"]: block["raw"] for block in goldbox_corpus.read_dax_blocks(path)}
    expected_ids = [18, *range(50, 62)]
    if sorted(blocks) != expected_ids:
        raise ValueError(f"unexpected 8X8D6.DAX block ids: {sorted(blocks)}")

    result = []
    for block_id in expected_ids:
        data = blocks[block_id]
        count = data[8] if len(data) > 8 else -1
        # Gateway's wilderness banks use its solved planar5 wall framing:
        # 17-byte header + 41-byte prefix + N contiguous 40-byte 8x8 tiles.
        expected_size = 17 + 41 + count * 40
        if count != 70 or len(data) != expected_size:
            raise ValueError(
                f"8X8D6 block {block_id}: expected 70 planar5 tiles/{expected_size} bytes, "
                f"got count {count}/{len(data)} bytes"
            )
        result.append(
            {"block_id": block_id, "size": len(data), "tile_count": count, "sha256": sha256(data)}
        )

    boot_path = path.parent / "8X8D1.DAX"
    boot_bank = None
    if boot_path.is_file():
        boot_raw = boot_path.read_bytes()
        boot_digest = sha256(boot_raw)
        if boot_digest != EXPECTED_8X8D1_SHA256:
            raise ValueError(f"unexpected Gateway 8X8D1.DAX SHA-256: {boot_digest}")
        boot_blocks = {
            block["block_id"]: block["raw"] for block in goldbox_corpus.read_dax_blocks(boot_path)
        }
        block202 = boot_blocks.get(202)
        if block202 is None or len(block202) != 1650 or block202[8] != 40:
            raise ValueError("Gateway 8X8D1 block 202 is not the expected 40-tile boot/UI bank")
        boot_bank = {
            "path": str(boot_path),
            "archive_sha256": boot_digest,
            "block_id": 202,
            "size": len(block202),
            "tile_count": block202[8],
            "sha256": sha256(block202),
            "arrow_local_tiles": [0, 1, 2, 3],
        }

    return {
        "path": str(path),
        "size": len(raw),
        "sha256": digest,
        "blocks": result,
        "boot_arrow_bank": boot_bank,
        "missing_sibling_archives": {
            "WALLDEF6.DAX": not (path.parent / "WALLDEF6.DAX").is_file(),
            "BIGPIC6.DAX": not (path.parent / "BIGPIC6.DAX").is_file(),
        },
    }


def transition_examples() -> list[dict[str, Any]]:
    seeds = [
        Pose(21, 15, 7, 1), Pose(22, 0, 7, 3), Pose(22, 15, 7, 1),
        Pose(22, 4, 15, 2), Pose(23, 0, 7, 3), Pose(23, 15, 7, 1),
        Pose(23, 3, 15, 2), Pose(23, 4, 15, 2), Pose(24, 0, 7, 3),
        Pose(24, 3, 15, 2), Pose(25, 15, 7, 1), Pose(25, 0, 0, 0),
        Pose(25, 12, 0, 0), Pose(26, 0, 7, 3), Pose(26, 0, 0, 0),
        Pose(26, 12, 0, 0),
    ]
    return [
        {"before": seed.evidence(), "after": transition(seed).evidence() if transition(seed) else None}
        for seed in seeds
    ]


def build_report(
    ecl_path: Path,
    geo6_path: Path | None,
    ovr_path: Path | None,
    tiles6_path: Path | None,
) -> dict[str, Any]:
    ecl_report = verify_ecl(ecl_path.read_bytes())
    ecl_report["path"] = str(ecl_path)
    return {
        "schema_version": 2,
        "provenance": "Gateway retail ECL6#21, GEO6/8X8D6 DAX, and optional GAME.OVR bytes",
        "ecl": ecl_report,
        "geo6": verify_geo6(geo6_path) if geo6_path else None,
        "tiles6": verify_8x8d6(tiles6_path) if tiles6_path else None,
        "host_call_080c": verify_ovr(ovr_path) if ovr_path else None,
        "wilderness_compositor": {
            "terrain": {
                "global_symbol": "0x2E + t",
                "symbol_set": "1 + floor(t / 70)",
                "local_tile": "t % 70",
                "blocks_for_submap_S": [18, "2*S+8", "2*S+9"],
                "domain": "0 <= t < 210",
            },
            "arrow": wilderness_arrow_route(0) | {
                "global_symbol": "0x100 + facing_ordinal",
                "local_tile": "facing_ordinal (0=N,1=E,2=S,3=W)",
                "overlay": True,
            },
        },
        "submap_transition_examples": transition_examples(),
        "sundabar": {
            "pose_gate": Pose(24, 0, 4, 3).evidence(),
            "prompt": "ENTER SUNDABAR?",
            "yes": sundabar_prompt(0),
            "no": sundabar_prompt(1),
        },
        "claim_boundary": (
            "Transition/cadence/prompt contracts are byte-derived. ECL alone does not prove that "
            "an arbitrary synthetic pose is naturally reachable or that a host has reproduced the "
            "native wall-collision prelude."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ecl_block", type=Path, help="extracted retail ECL6 block 21")
    parser.add_argument("--geo6", type=Path, help="optional retail GEO6.DAX")
    parser.add_argument("--game-ovr", type=Path, help="optional retail Gateway GAME.OVR")
    parser.add_argument("--8x8d6", dest="tiles6", type=Path, help="optional retail 8X8D6.DAX")
    args = parser.parse_args()
    print(json.dumps(build_report(args.ecl_block, args.geo6, args.game_ovr, args.tiles6), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
