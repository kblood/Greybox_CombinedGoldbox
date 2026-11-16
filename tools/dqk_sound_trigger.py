#!/usr/bin/env python3
"""Derive DQK's PlaySound id -> SOUNDS.GLB member/rate table from DQK.EXE bytes.

Static only.  Everything is read from the retail ``DQK.EXE`` (plain MZ, not packed) and
``DISK1/SOUNDS.GLB``.  Addresses are FILE offsets; ``file = 0x2400 + seg*16 + off`` (the MZ
header is 0x2400 bytes; segment words in far calls are unrelocated).  See
``docs/engine/research/dqk-sound-triggers.md`` for the derivation and caveats.

Pinned facts (each re-checked against the bytes by :func:`check_pins`):

* ``PlaySound`` = far ``1023:0006`` = file 0x12636.  It accepts ids 0..0x29 and 0xFF, rewrites
  0x0B -> 0x0E / 0x0F when ``creature[+0x3A]`` is 3 / 6, then dispatches through a 27-entry
  key table at file 0x12693 and a target table at file 0x126C9.
* Ids 3..0xF share one handler; they reach the driver front end ``0FD3:0176`` (file 0x122A6),
  whose default branch range-checks ``3 <= id < 0x10`` and does ``id -= 3`` (``83 EF 03``).
* In the digital-library branch the player ``18FC:0016`` indexes the ``sounds`` HLIB with
  that value via ``193F:01FD`` (``HLIB`` magic, count at +8, member pointers at 0x10 + 4*i).
  Hence ids 3..0xF -> SOUNDS.GLB members 0..12, header rate = big-endian u16 at member +0.
"""
from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

HDR = 0x2400
PLAYSOUND_FILE = 0x12636           # far 1023:0006
DISPATCH_KEYS_FILE = 0x12693       # 27 x u16 keys
DISPATCH_TARGETS_FILE = 0x126C9    # 27 x u16 handler offsets (segment base = file 0x12630)
DISPATCH_SEG_BASE = 0x12630
FRONT_END_FILE = 0x122A6           # far 0FD3:0176
PLAYSOUND_CALL = bytes.fromhex("9a06002310")   # lcall 0x1023:0x0006

EXPECTED_KEYS = list(range(0x10)) + list(range(0x20, 0x2A)) + [0xFF]

# SFXDQ.VOC / SOUNDS.GLB member names (packages/engine/src/audio/voc.ts DQK_SFX_NAMES).
MEMBER_NAMES = ["cast", "flame", "sorcery", "die", "sling", "hit", "lightning",
                "swing", "walk", "fireball", "bow", "sploosh", "crackle"]

# id -> (member, expected header rate).  Rates are the pin; they are re-read from the GLB.
EXPECTED_RATES = {0: 7418, 1: 7418, 2: 7418, 3: 11127, 4: 7418, 5: 7418, 6: 11127,
                  7: 7418, 8: 7418, 9: 5564, 10: 7418, 11: 7418, 12: 7418}

# Caller sites of PlaySound with an immediate id (file offset of the lcall -> id) found by
# scanning DQK.EXE; value is (id, enclosing function file offset, context evidence).
# Context strings are DS literals referenced within +-0x180 bytes; "inference" marks event
# names that are read from sibling call structure rather than from a string.
CALLER_CONTEXT = {
    0x24372: (5, 0x24301, "inference: sibling of 0x2437E; flag-selected spell-effect animation"),
    0x2437E: (4, 0x24301, "inference: other arm of the same flag test"),
    0x2560A: (0xB, 0x25420, "TACTICAL COMBAT move (creature far ptr + facing; subtracts move points at creature+0x40->+7), NOT the exploration step"),
    0x261D0: (8, 0x26177, "string 'Nothing Happens...' nearby; melee/item hit arm"),
    0x26436: (8, 0x26177, "string 't is full!' nearby"),
    0x2652F: (0xA, 0x26177, "string 't is full!' nearby; swing arm"),
    0x27671: (0xD, 0x275E8, "inference: ranged attack, bow arm"),
    0x276C1: (7, 0x275E8, "inference: ranged attack, sling arm"),
    0x276FD: (0xA, 0x275E8, "inference: ranged attack, swing/other arm"),
    0x2B086: (6, 0x2B075, "inference: combatant dies"),
    0x2B137: (6, 0x2B075, "inference: combatant dies"),
    0x31ADE: (0xFF, 0x3196F, "string 'Woof' nearby; stop-all"),
    0x31BB1: (0xFF, 0x3196F, "string 'Woof' nearby; stop-all"),
    0x3872D: (0x20, 0x38705, "string 'title' (XMI music, not DIG4)"),
    0x387E1: (0x27, 0x3878B, "string 'final1' (XMI music, not DIG4)"),
    0x43B2A: (0xB, 0x43B26, "EXPLORATION party step: mode [ae57]==4, called near from 0x441F5 after the passability test 1d99:10fd==1; plays BEFORE the position advances"),
    0x4B4C6: (0xFF, 0x4B1B3, "stop-all"),
    0x54923: (9, 0x5485B, "string 'breathes lightning' nearby; breath weapon"),
    0x5B97E: (0xC, 0x5B73B, "spell-cast animation chooser: fireball arm"),
    0x5B98A: (9, 0x5B73B, "spell-cast animation chooser: lightning arm"),
    0x5B996: (3, 0x5B73B, "spell-cast animation chooser: generic cast arm"),
    0x5C13A: (3, 0x5C0ED, "inference: generic cast"),
}
# Callers whose id is a runtime value (not an immediate).
DYNAMIC_CALLERS = {0x249EF: "string 'is bandaged'; id = caller arg [bp+0xA]",
                   0x3315F: "save-disk routine; id = result of 0x31E32(1)"}


def find_dqk_dir() -> Path | None:
    here = Path(__file__).resolve().parent.parent
    for c in (here / "The Dark Queen of Krynn", Path("C:/Modding/GoldBox/The Dark Queen of Krynn")):
        if (c / "DQK.EXE").is_file() and (c / "DISK1" / "SOUNDS.GLB").is_file():
            return c
    return None


def parse_dispatch(exe: bytes):
    keys = list(struct.unpack("<27H", exe[DISPATCH_KEYS_FILE:DISPATCH_KEYS_FILE + 54]))
    tg = list(struct.unpack("<27H", exe[DISPATCH_TARGETS_FILE:DISPATCH_TARGETS_FILE + 54]))
    return keys, tg


def parse_glb(glb: bytes):
    """Return [(rate, declared_len, member_len)] for the 13 DIG4 members."""
    if glb[:4] != b"HLIB" or glb[12:16] != b"DIG4":
        raise ValueError("not an HLIB DIG4 library")
    n = struct.unpack("<I", glb[8:12])[0]
    ptrs = list(struct.unpack("<%dI" % (n + 1), glb[16:16 + 4 * (n + 1)]))
    out = []
    for i in range(n):
        a, e = ptrs[i], ptrs[i + 1]
        out.append((struct.unpack(">H", glb[a:a + 2])[0], struct.unpack(">H", glb[a + 4:a + 6])[0], e - a))
    return out


def scan_playsound_callers(exe: bytes):
    """{file_offset: immediate_id or None} for every far call to PlaySound."""
    res = {}
    for m in re.finditer(re.escape(PLAYSOUND_CALL), exe):
        s = m.start()
        imm = None
        if exe[s - 1] == 0x50 and exe[s - 4] == 0xB8:
            imm = exe[s - 3] | exe[s - 2] << 8
        elif exe[s - 1] == 0x50 and exe[s - 3] == 0xB0:
            imm = exe[s - 2]
        res[s] = imm
    return res


def id_to_member(sound_id: int) -> int | None:
    """DIG4 member for a PlaySound id (3..0xF -> id-3); None for non-DIG4 ids."""
    return sound_id - 3 if 3 <= sound_id <= 0xF else None


def classify(sound_id: int) -> str:
    if sound_id in (0, 1, 2):
        return "control (0 sound-off flag, 1 sound-on flag, 2 stop SFX)"
    if 3 <= sound_id <= 0xF:
        return "digitized SFX: SOUNDS.GLB DIG4 member id-3 (or SFXDQ.VOC marker when the card is the SB-digital driver)"
    if 0x20 <= sound_id <= 0x27:
        return "XMI music track (NOT DIG4, NOT PC speaker)"
    if sound_id in (0x28, 0x29, 0xFF):
        return "music control (start/stop XMI slot; 0xFF stop-all)"
    return "unmapped"


def build_table(exe: bytes, glb: bytes):
    members = parse_glb(glb)
    table = {}
    for sid in range(3, 0x10):
        m = id_to_member(sid)
        rate, declared, mlen = members[m]
        table[sid] = {"member": m, "name": MEMBER_NAMES[m], "rate": rate,
                      "payload_len": declared, "member_len": mlen}
    return table


def check_pins(exe: bytes, glb: bytes) -> list[str]:
    """Return a list of violated pins (empty = every pin holds)."""
    bad: list[str] = []
    keys, tg = parse_dispatch(exe)
    if keys != EXPECTED_KEYS:
        bad.append("dispatch key table differs")
    # ids 3..0xF share a single handler offset; 0x20..0x27 another
    if len({tg[keys.index(i)] for i in range(3, 0x10)}) != 1:
        bad.append("ids 3..0xF do not share one handler")
    # rewrite: cmp [bp+6],0xB ; ... es:[bx+0x3a]==3 -> 0xE ; ==6 -> 0xF
    pat = bytes.fromhex("837e060b7522c41e0fb226807f3a037507c746060e00eb10c41e0fb226807f3a067505c746060f00")
    if exe[PLAYSOUND_FILE + 0x1C:PLAYSOUND_FILE + 0x1C + len(pat)] != pat:
        bad.append("0x0B->0x0E/0x0F creature rewrite bytes differ")
    # front end: range check 3 <= id < 0x10 then id -= 3
    fe = exe[0x12412:0x12412 + 0x1B]
    if fe[:5] != bytes.fromhex("83ff037c03") and fe[:2] != bytes.fromhex("83ff"):
        bad.append("front-end low range check differs")
    if bytes.fromhex("83ef03") not in exe[0x1242C:0x12430]:
        bad.append("front-end 'sub di,3' differs")
    if exe[0x1241A:0x1241D] != bytes.fromhex("83ff10"):
        bad.append("front-end upper bound 0x10 differs")
    # callers
    found = scan_playsound_callers(exe)
    for site, (sid, _f, _c) in CALLER_CONTEXT.items():
        if found.get(site) != sid:
            bad.append("caller %#x id %r != %#x" % (site, found.get(site), sid))
    # exploration step: key handler tests passability (1d99:10fd == 1), sets [ae48]=1, then
    # near-calls 0x43B26 (PlaySound(0x0B); 50 ms delay; x/y += facing deltas with wrap).
    if exe[0x441EB:0x441F5] != bytes.fromhex("3c017509c60648ae010e") or exe[0x441F5] != 0xE8:
        bad.append("exploration-step call context differs")
    rel = struct.unpack("<h", exe[0x441F6:0x441F8])[0]
    if 0x441F8 + rel != 0x43B26:
        bad.append("exploration-step near call does not target 0x43B26")
    if exe[0x43B26:0x43B2B] != bytes.fromhex("b80b00509a"):
        bad.append("0x43B26 does not begin PlaySound(0x0B)")
    # combat move routine 0x25420 subtracts move points (creature+0x40 -> +7)
    if exe[0x25526:0x2552A] != bytes.fromhex("26284707"):
        bad.append("combat-move move-point subtraction differs")
    # GLB rates
    members = parse_glb(glb)
    if len(members) != 13:
        bad.append("GLB member count %d != 13" % len(members))
    else:
        for m, (rate, declared, mlen) in enumerate(members):
            if rate != EXPECTED_RATES[m]:
                bad.append("member %d rate %d != %d" % (m, rate, EXPECTED_RATES[m]))
            if declared not in (mlen - 6, mlen - 7):
                bad.append("member %d length word inconsistent" % m)
    return bad


def main() -> int:
    d = find_dqk_dir()
    if not d:
        print("DQK data absent", file=sys.stderr)
        return 2
    exe = (d / "DQK.EXE").read_bytes()
    glb = (d / "DISK1" / "SOUNDS.GLB").read_bytes()
    bad = check_pins(exe, glb)
    print("pins:", "OK" if not bad else bad)
    for sid, r in build_table(exe, glb).items():
        print("id %#04x -> member %2d %-9s %5d Hz len %d" % (sid, r["member"], r["name"], r["rate"], r["payload_len"]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
