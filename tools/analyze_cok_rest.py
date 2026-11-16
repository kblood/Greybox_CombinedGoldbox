"""Verify the held DOS CoK rest contract from GAME.OVR and unpacked START.EXE.

Offsets identify this retail build, not arbitrary Gold Box executables. Opcode
guards prevent a different build from silently producing plausible constants.
This is static evidence; it does not claim a live rest session was observed.
"""
from __future__ import annotations

import hashlib
import json
import re
import struct
from pathlib import Path

try:
    from tools.exepack_unpack import unpack
    from tools.borland_overlay import read_descriptor, resolve_far_call, walk_descriptors
except ModuleNotFoundError:
    from exepack_unpack import unpack
    from borland_overlay import read_descriptor, resolve_far_call, walk_descriptors


def require(data: bytes, offset: int, expected: str) -> None:
    pin = bytes.fromhex(expected)
    if data[offset:offset + len(pin)] != pin:
        raise ValueError(f"CoK instruction mismatch at {offset:#x}")


def near_target(data: bytes, offset: int) -> int:
    require(data, offset, "e8")
    return offset + 3 + struct.unpack_from("<h", data, offset + 1)[0]


def analyze_timed_affects(ovr: bytes, start: bytes, db_base: int) -> dict:
    """Pin the timer, expiry dispatch and serialized linked-node width."""
    if near_target(ovr, 0x2AE43) != 0x2A9CF:
        raise ValueError("CoK clock no longer calls the affect timer")
    require(ovr, 0x2A9D5, "80 3e 49 4b 02")  # camp state gates eligibility flags
    require(ovr, 0x2AA49, "8b 85 74 38")       # same clock radix table
    require(ovr, 0x2AA2B, "8a 46 08 30 e4 89 46 fb")  # unsigned step byte
    require(ovr, 0x2AA39, "80 7e ff 01 7e 1e")  # slots <= 1 do not scale
    require(ovr, 0x2AA4D, "f7 66 fb 89 46 fb")  # low word of each product
    require(ovr, 0x2AA66, "83 7e fb 0a")       # at most ten units per chunk
    require(ovr, 0x2AAB4, "26 8b 85 e3 00 26 8b 95 e5 00")
    require(ovr, 0x2AB48, "26 83 7d 01 00 75 14")  # zero duration skips expiry
    require(ovr, 0x2AB6B, "26 3b 45 01 73 2b")     # >= expires, not just >
    require(ovr, 0x2AB79, "26 29 45 01")
    require(ovr, 0x2ABC0, "9a 2f 00 db 00")
    require(start, 0xDB0 + 0x2F, "cd 3f")
    expiry = db_base + struct.unpack_from("<H", start, 0xDB0 + 0x2F + 2)[0]
    if expiry != 0x34194:
        raise ValueError("CoK affect expiry target moved")
    require(ovr, 0x341F5, "26 80 7d 04 00 74 16")  # applied flag gates reversal
    if near_target(ovr, 0x3420F) != 0x34153:
        raise ValueError("CoK expiry no longer calls affect dispatch")
    require(ovr, 0x3418C, "ff 9d 94 6b")  # indexed callback table, DS:6B94
    require(ovr, 0x342A2, "b8 09 00 50 9a 54 02 46 0a")  # free nine-byte node
    require(ovr, 0x1E8BB, "04 2e 73 66 78")  # Pascal .sfx extension
    require(ovr, 0x1E80F, "bf e8 0b 0e 57") # writer appends that CS string
    require(ovr, 0x1E830, "26 8b 85 e3 00 26 8b 95 e5 00")
    require(ovr, 0x1E858, "b8 09 00 50 31 c0 50 50 9a bb 14 46 0a")
    require(ovr, 0x1E869, "26 8b 45 05 26 8b 55 07")
    # Rest initializes every cached member flag. These flags skip empty timer
    # lists on subsequent passes; they do not exclude actors by condition.
    require(ovr, 0x2B6E7, "bf b4 46 1e 57 b8 48 00 50 b0 01 50 9a 61 16 46 0a")
    # The loader reads each complete record then clears its saved link. The
    # preceding allocation path links the new node to the previous node.
    require(ovr, 0x1EBE2, "b8 09 00 50 8d be 7e fe 16 57 9a b4 14 46 0a 83 be 7e fe 09")
    require(ovr, 0x1EC6C, "b8 09 00 50 9a f8 09 46 0a c4 be 72 fe 31 c0 26 89 45 05 26 89 45 07")
    require(ovr, 0x342AB, "80 7e 0a 0e 75 0d ff 76 0e ff 76 0c b0 05 50 0e e8 30 14 80 7e 0a 0c 74 06 80 7e 0a 26 75 0d")
    # The table is initialized at runtime. Resolve stubs separately by segment:
    # 112 point into 0x65's overlay, but eight use 0xBA's different base.
    rows = []
    for match in re.finditer(rb"\xb8(..)\xba(..)\xa3(..)\x89\x16(..)", ovr, re.S):
        offset, segment, dest, dest_hi = struct.unpack("<HHHH", b"".join(match.groups()))
        if 0x6B94 <= dest <= 0x6D74:
            if dest_hi != dest + 2 or (dest - 0x6B94) % 4:
                raise ValueError("CoK callback initializer has invalid table destination")
            rows.append(((dest - 0x6B94) // 4, segment, offset))
    if len(rows) != 120 or {r[0] for r in rows} != set(range(1, 121)):
        raise ValueError("CoK callback initializer is incomplete or duplicated")
    prologues = {m.start() for m in re.finditer(bytes.fromhex("55 89 e5"), ovr)}
    bases = {}
    for _, segment, offset in rows:
        stub = segment * 16 + offset
        require(start, stub, "cd 3f")
        procedure = struct.unpack_from("<H", start, stub + 2)[0]
        candidates = {p - procedure for p in prologues if p >= procedure}
        bases[segment] = bases.get(segment, candidates) & candidates
    if any(len(candidates) != 1 for candidates in bases.values()):
        raise ValueError("CoK callbacks do not resolve to unique per-segment overlays")
    resolved = {seg: next(iter(candidates)) for seg, candidates in bases.items()}
    callbacks = {
        ident: {"segment": seg, "stub": off,
                "target": resolved[seg] + struct.unpack_from("<H", start, seg * 16 + off + 2)[0]}
        for ident, seg, off in rows
    }
    require(ovr, 0x11B5B, "04 61 67 65 73")  # Pascal "ages"
    require(ovr, 0x11B69, "26 8a 45 03 24 10 08 c0 75 41")
    require(ovr, 0x11B7C, "05 10 00")
    require(ovr, 0x11B82, "26 88 45 03")
    require(ovr, 0x11B95, "bf 73 0f 0e 57")
    require(ovr, 0x11BB0, "26 ff 45 60")
    require(ovr, 0x11BB4, "a0 32 6b 30 e4 d1 e0 a2 32 6b 89 ec 5d ca 0a 00")
    require(ovr, 0x12034, "55 89 e5 a0 32 6b 30 e4 d1 e8 a2 32 6b 5d ca 0a 00")
    if resolved.get(0x65, -1) + 0xF73 != 0x11B5B or callbacks[0x27]["target"] != 0x11B60:
        raise ValueError("CoK haste aging message/callback linkage moved")
    return {
        "timer_target": 0x2A9CF, "expiry_target": expiry,
        "character_list_offset": 227, "node_bytes": 9,
        "id_offset": 0, "duration_offset": 1, "applied_offset": 4,
        "next_pointer_offset": 5, "zero_duration_expires": False,
        "expiry_comparison": "elapsed >= remaining",
        "elapsed_chunk_max": 10, "callback_table_ds": 0x6B94,
        "save_extension": ".sfx", "save_node_bytes": 9,
        "loader_rebuilds_links": True, "camp_timer_flags_initially_all_set": True,
        "post_removal_callback_ids": [0x0C, 0x0E, 0x26],
        "callback_overlay_bases": resolved, "callbacks": callbacks,
        "haste_age": {"character_word_offset": 96, "node_flag_offset": 3,
                      "once_bit": 0x10, "increment": 1, "message": "ages"},
        "limits": "static evidence; callback semantics and camp eligibility unresolved",
    }


def read_affect_records(data: bytes) -> list[dict]:
    """Inspect serialized nine-byte nodes; saved far pointers are not dereferenced."""
    if len(data) % 9:
        raise ValueError("CoK SFX length is not a whole number of nine-byte nodes")
    return [
        {"id": data[i], "duration": struct.unpack_from("<H", data, i + 1)[0],
         "byte3": data[i + 3], "applied": data[i + 4],
         "saved_next_pointer": data[i + 5:i + 9].hex()}
        for i in range(0, len(data), 9)
    ]


def analyze_memorization(ovr: bytes) -> dict:
    require(ovr, 0x4403, "3c 3b 75 06 0e")
    if near_target(ovr, 0x4408) != 0x3AF7:
        raise ValueError("CoK SPELL dispatch moved")
    require(ovr, 0x3B05, "b0 03 50 9a 2a 00 4e 00")
    require(ovr, 0x3B5B, "c6 46 fe 00")  # reset slot to zero for every member
    require(ovr, 0x3B69, "26 8a 45 1e 3a 46 ff")  # exact byte comparison
    require(ovr, 0x3B78, "80 7e fe 39 73 05")
    require(ovr, 0x3BB8, "fe 46 fd")
    require(ovr, 0x3BC3, "c6 46 fe ff")
    require(ovr, 0x3BCA, "8a 46 fe 30 e4 50 9a 52 00 4e 00")
    require(ovr, 0x3BD8, "8a 46 fd 30 e4 50 9a 52 00 4e 00")
    if near_target(ovr, 0x2B7E7) != 0x2B4FA or near_target(ovr, 0x2B7F0) != 0x2B5B0:
        raise ValueError("CoK rest memorization call order moved")
    require(ovr, 0x2B2FF, "0d 68 61 73 20 6d 65 6d 6f 72 69 7a 65 64")
    require(ovr, 0x2B31B, "80 7e fd 39")
    require(ovr, 0x2B337, "26 80 7d 1e 7f")
    require(ovr, 0x2B372, "26 80 6d 1e 80")
    require(ovr, 0x2B35B, "b1 04 d3 e7 8a 85 b4 31")
    require(ovr, 0x2B546, "26 80 7d 58 00")
    require(ovr, 0x2B5BF, "26 80 3d 0c")
    require(ovr, 0x2B5F5, "26 fe 4d 58")
    require(ovr, 0x2B57E, "30 e4 8b f0 d1 e0 01 f0")
    require(ovr, 0x1A7B3, "c6 46 f3 04")
    require(ovr, 0x1A7B7, "80 7e fd 02 77 06 80 7e fc 02 76 04 c6 46 f3 06")
    require(ovr, 0x1A7CD, "26 88 45 58")
    if near_target(ovr, 0x1B59A) != 0x1A6A0:
        raise ValueError("CoK preparation-delay setup caller moved")
    return {"spell_query_target": 0x3AF7, "queue_offset": 30, "queue_slots": 58,
            "slot_base": 0, "owner_base": 0, "missing_slot": 255,
            "query_compares_raw_byte": True, "pending_bit": 128,
            "preparation_hours_offset": 88, "hour_ticks": 12,
            "ticks_per_level": 3, "spell_table_ds": 0x31B4, "spell_table_stride": 16,
            "queued_preparation_hours": [4, 6], "long_preparation_above_level": 2}


def analyze_learning_schedule(ovr: bytes, start: bytes, data_base: int) -> dict:
    """Verify the rest-action boundary, grimoire bound and scroll predicate."""
    descriptors = walk_descriptors(start, ovr, 0x1C3, 0x38)
    if len(descriptors) != 34 or descriptors[-1].file_end != len(ovr):
        raise ValueError('CoK overlay descriptor chain changed')
    targets = {}
    prologues = {m.start() for m in re.finditer(bytes.fromhex('55 89 e5'), ovr)}
    for segment in (0xAF, 0xA8):
        calls = {struct.unpack_from('<H', ovr, i+1)[0] for i in range(len(ovr)-4)
                 if ovr[i] == 0x9A and ovr[i+3:i+5] == struct.pack('<H', segment)}
        bases = None
        for call in calls:
            stub = segment*16+call
            require(start, stub, 'cd 3f')
            procedure = struct.unpack_from('<H', start, stub+2)[0]
            candidates = {p-procedure for p in prologues if p >= procedure}
            bases = candidates if bases is None else bases & candidates
        if not bases or len(bases) != 1:
            raise ValueError('CoK learning overlay base is not unique')
        base = bases.pop()
        call = 0x2A if segment == 0xAF else 0x5C
        targets[segment] = base+struct.unpack_from('<H', start, segment*16+call+2)[0]
        if read_descriptor(start, ovr, segment).resolve(call) != targets[segment]:
            raise ValueError('descriptor and independent prologue resolution disagree')
    if targets != {0xAF: 0x2B69C, 0xA8: 0x2A257}:
        raise ValueError('CoK rest/selector target moved')
    require(ovr, 0x1C342, '3c 52 75 09')
    require(ovr, 0x1D422, '3c 52 75 10')
    for call in (0x1C34C, 0x1D431):
        if near_target(ovr, call) != 0x1B573:
            raise ValueError('CoK R no longer calls the party estimator')
    require(ovr, 0x1B5F9, '9a 2a 00 af 00')
    require(ovr, 0x2B6A6, 'c6 46 f1 00')
    require(ovr, 0x2B6CA, 'c6 85 2d 71 00')
    require(ovr, 0x1A7D6, 'ba 0f 00 f7 e2')
    require(ovr, 0x1A7E2, 'ba 0f 00 f7 e2')
    require(ovr, 0x1A7EE, 'ba 3c 00 f7 e2 03 c1 03 c3')
    require(ovr, 0x2E832, 'c6 46 fe 01')
    require(ovr, 0x2E846, '26 80 7d 62 00')
    require(ovr, 0x2E87D, '80 7e fe 6b')
    require(ovr, 0x33344, '26 80 7d 2e 27')
    require(ovr, 0x3334E, '26 80 7d 2e 28')
    require(ovr, 0x2B436, '26 80 7d 3b 80')
    require(ovr, 0x2B324, '80 7e fe 00')  # zero-level lookahead continues scanning
    require(ovr, 0x2B363, '88 46 fe')
    removal = resolve_far_call(start, ovr, 0x333D6)
    if removal != 0x37C3D:
        raise ValueError('CoK scribing item removal target moved')
    require(ovr, 0x37D22, 'b8 3f 00 50 9a 54 02 46 0a')
    levels = start[data_base+0x31B4:data_base+0x31B4+108*16:16]
    if len(levels) != 108 or max(levels) != 7:
        raise ValueError('CoK spell-level table shape changed')
    return {'rest_target': targets[0xAF], 'selector_target': targets[0xA8],
            'grimoire_id_min': 1, 'grimoire_id_max': 107, 'known_spell_base': 98,
            'levels': list(levels), 'scroll_item_ids': [39, 40],
            'scroll_pending_offsets': [60, 61, 62],
            'scribing_item_removal_target': removal,
            'overlay_descriptors': len(descriptors),
            'overlay_procedures': sum(len(d.procedure_offsets) for d in descriptors),
            'new_rest_resets_preparation_phase_and_counts': True,
            'lookahead_skips_zero_levels': True}


def analyze(ovr: bytes, start: bytes) -> dict:
    require(ovr, 0, "46 42 4f 56")
    require(ovr, 0x1D2AC, "c6 06 49 4b 02 31 c0 a3 36 71")
    require(ovr, 0x2B254, "ff 06 36 71 81 3e 36 71")
    require(ovr, 0x2B25E, "73 03")  # heal when counter >= period
    heal_period = struct.unpack_from("<H", ovr, 0x2B25C)[0]
    require(ovr, 0x2B282, "b0 01 50 b0 00 50 9a 84 00 db 00")
    require(ovr, 0x2B2F4, "31 c0 a3 36 71")  # reset after healing
    require(ovr, 0x2B7D4, "b0 05 50 b0 01 50 0e")
    if near_target(ovr, 0x2B7DB) != 0x2ADA7:
        raise ValueError("rest loop no longer calls the clock advance routine")
    if near_target(ovr, 0x2B7E3) != 0x2B24E:
        raise ValueError("rest loop no longer calls the healing counter routine")
    # Clock normalization reads DS:[0x3874 + slot*2]. The resident startup
    # establishes DS with a relocated paragraph constant, independent of the
    # expected radix values themselves.
    require(ovr, 0x2ACCE, "8b 95 74 38")
    require(start, 0xA460, "ba")
    require(start, 0xA463, "8e da")
    data_base = struct.unpack_from("<H", start, 0xA461)[0] * 16
    radix_offset = data_base + 0x3874
    if radix_offset + 14 > len(start):
        raise ValueError("clock radix table outside unpacked START image")
    radices = list(struct.unpack_from("<7H", start, radix_offset))
    # Area2 field access and the ECL setter share the same resident pointer.
    require(ovr, 0x2B7F3, "c4 3e 2c 4b 26 83 bd a4 05 00")
    require(ovr, 0x2B7FF, "ff 06 53 4b")
    require(ovr, 0x2B80A, "26 3b 85 a4 05")
    require(ovr, 0x2B811, "31 c0 a3 53 4b")
    require(ovr, 0x2B816, "b0 01 50 b0 64 50 9a 4d 00 db 00")
    require(ovr, 0x2B827, "26 3b 85 a6 05 77 39")  # interrupt if roll <= chance
    require(ovr, 0x98BD, "8b 46 08 d1 e0 c4 3e 2c 4b 03 f8 26 89 95 00 08")
    # Resolve every distinct 0xDB call through the unpacked resident stubs.
    # Require one base at which ALL targets are real Borland prologues; older
    # packed-image resolution notes used a different, incorrect base here.
    calls = {struct.unpack_from("<H", ovr, i + 1)[0]
             for i in range(len(ovr) - 4)
             if ovr[i] == 0x9A and ovr[i + 3:i + 5] == b"\xdb\x00"}
    prologues = {i for i in range(len(ovr) - 2) if ovr[i:i + 3] == b"\x55\x89\xe5"}
    bases = None
    for call in calls:
        stub = 0xDB0 + call
        require(start, stub, "cd 3f")
        offset = struct.unpack_from("<H", start, stub + 2)[0]
        candidates = {p - offset for p in prologues if p >= offset}
        bases = candidates if bases is None else bases & candidates
    if not bases or len(bases) != 1:
        raise ValueError("CoK DB stubs do not resolve to a unique overlay base")
    heal_base = bases.pop()
    heal_target = heal_base + struct.unpack_from("<H", start, 0xDB0 + 0x84 + 2)[0]
    if heal_target != 0x36195:
        raise ValueError("CoK healing target moved")
    require(ovr, 0x361A2, "26 8a 85 88 01 50 bf ca 21")
    eligible_bits = ovr[heal_base + 0x21CA:heal_base + 0x21CA + 32]
    require(ovr, 0x361ED, "26 88 85 97 01")  # current HP store
    require(ovr, 0x36206, "26 8a 45 62")      # cap from maximum HP
    require(ovr, 0x36215, "26 80 bd 89 01 00 75 38")  # per-member byte-393 guard; full flag meaning unresolved
    require(ovr, 0x36220, "26 80 bd 88 01 05")
    require(ovr, 0x3622B, "26 c6 85 88 01 04")  # dying -> down
    require(ovr, 0x3623C, "80 3e 49 4b 05 74 12")  # wake only outside combat
    require(ovr, 0x36246, "26 c6 85 88 01 00")  # normal, no COAB affect helper
    return {
        "evidence": "static retail instructions; no live rest trace",
        "game_ovr_sha256": hashlib.sha256(ovr).hexdigest(),
        "unpacked_start_sha256": hashlib.sha256(start).hexdigest(),
        "clock_slot": ovr[0x2B7D8],
        "clock_units_per_iteration": ovr[0x2B7D5],
        "clock_radices": radices,
        "clock_radices_image_offset": radix_offset,
        "dgroup_image_offset": data_base,
        "heal_every_iterations": heal_period,
        "heal_amount": 1,
        "heal_counter_ds": 0x7136,
        "heal_counter_resets_on_camp_entry": True,
        "encounter_counter_ds": 0x4B53,
        "encounter_period_area2_offset": 0x5A4,
        "encounter_chance_area2_offset": 0x5A6,
        "encounter_period_ecl": ((0x5A4 - 0x800) & 0xFFFF) // 2,
        "encounter_chance_ecl": ((0x5A6 - 0x800) & 0xFFFF) // 2,
        "encounter_roll": "1d100 <= percentage, after period iterations",
        "db_stub_count": len(calls),
        "db_overlay_base": heal_base,
        "healing_target": heal_target,
        "healing_eligible_statuses": [i for i in range(256) if eligible_bits[i // 8] & (1 << (i % 8))],
        "timed_affects": analyze_timed_affects(ovr, start, heal_base),
        "memorization": analyze_memorization(ovr),
        "learning_schedule": analyze_learning_schedule(ovr, start, data_base),
    }


def main() -> None:
    game = Path(__file__).resolve().parents[1] / "Champions of Krynn"
    start, _ = unpack(game / "START.EXE")
    result = analyze((game / "GAME.OVR").read_bytes(), start)
    result["held_sfx_records"] = {
        p.name: read_affect_records(p.read_bytes())
        for p in sorted((game / "SAVE").glob("*.SFX"))
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
