"""Read DQK's original XP thresholds and training predicate.

Offsets refer to the full physical character record, including its first
eight bytes. CCPARTY's shifted import view uses offsets eight bytes lower.
This models the located training helpers and, since 2026-10-07, the creation
path: class initializer, first-level HP helper, and the XP-driven levelling
loop. Equipment, spells, saving throws and thief skills are NOT modelled.
Retail bytes stay external.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import struct
import sys


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXE = ROOT / "The Dark Queen of Krynn/DQK.EXE"
DGROUP_FILE = 0x63A20
RECORD_FIELD_SPAN = 0x19E  # Fields needed here; QCH/QSV variable tails differ.
CLASS_NAMES = ("cleric", "knight", "fighter", "paladin", "ranger", "mage", "thief")
CATEGORY_NAMES = (
    "good cleric", "neutral cleric", "fighter", "crown knight", "sword knight",
    "rose knight", "ranger", "white mage", "red mage", "thief", "paladin",
)
# File spans recovered through the actual far-call chain, including the
# category jump table. Refuse another executable revision rather than reading
# unrelated bytes at these offsets. Tables are read, never copied into source.
CODE_ANCHORS = (
    (0xBB19, 0xBBC5, "9015d4a35b47f0df4c9ec9e3855e2e5e7dd6ea38d88cc4d261d3942264ea02bd"),
    (0xBBC5, 0xBCAE, "7c53ffd5e5fcab896fa45ff68774343196cb6134b0b4465f9f984dcd7923c68d"),
    (0x62B8C, 0x62C2C, "5ff9793f02147715270b144cf7277e0175238e204d12d8dbccb2efbacc905e13"),
    # Creation-path helpers (2026-10-07): HP helper 1d99:143b, CON helper
    # 2b3a:3a5b, level-up 2aa7:0022, class init 25a4:0dbf, race init
    # 25a4:1839, creator 25a4:220a.
    (0x603BE, 0x6060B, "6dcdf925ac4f80c09c5bed1232aae5f5fa440a7c1b1665551d9eacd228de2832"),
    (0x6060B, 0x60695, "dd515c5f7287a36298f73cc94773f25a8eb67736dc29ee328a893a45c9283ee5"),
    (0x3F512, 0x3FD66, "e8ad72c4a1cf8a845940d11d730d37187bbac9878b0b76bbcc86f1d055e06587"),
    (0x3B27F, 0x3B407, "9ae065d65a53da93ce952698737425003451c30c9065284742e10f74fbd9a351"),
    (0x3BCF9, 0x3BDFF, "c536dae97ea0a89758d7581f8f8acd2a827e47fbd1f3d5c843c24f43ff73bee0"),
    (0x3C6CA, 0x3C7C6, "d57c1414f84f8fe2d565318141de5a9e2e5cfa3ee5aeb9787f9e5d97d5302e57"),
)
OVERLAY11_FILE = 0x5CBB0   # overlay 11 code base; HP helper 143b = +0x380e
RECORD_SIZE = 0x19E
RACE_NAMES = ("silvanesti elf", "qualinesti elf", "half-elf", "hill dwarf",
              "mountain dwarf", "kender", "human")
CREATE_CLASSES = {"cleric": 0, "knight": 1, "fighter": 2, "ranger": 4,
                  "mage": 5, "thief": 6}
CREATION_XP = 1_000_001
DEFAULT_ABILITIES = (14, 14, 14, 14, 15, 14)  # native default, not a retail rule



def _check_record(record: bytes) -> None:
    if len(record) < RECORD_FIELD_SPAN:
        raise ValueError(f"full character record requires at least {RECORD_FIELD_SPAN} bytes")


def category_for_slot(record: bytes, slot: int) -> int:
    """77E:1F39 (file BB19); defined slots and knight orders only."""
    _check_record(record)
    if not 0 <= slot < 7:
        raise ValueError("class slot must be 0..6")
    if slot == 0:
        # Original CMP/JG uses the signed word, not an unsigned byte.
        return int(struct.unpack_from("<h", record, 0x19B)[0] > 4)
    if slot == 1:
        order = record[0x19A]
        if order not in (1, 2, 3):
            # Original leaves its local result uninitialized on this path.
            raise ValueError("knight order must be 1..3")
        return order + 2
    if slot == 5:
        return 7 if record[0x19D] == 1 else 8
    return {2: 2, 3: 10, 4: 6, 6: 9}[slot]


def _read_creation_tables(image: bytes) -> dict:
    """Tables and code immediates the creation path reads, taken from the exe."""
    dg = DGROUP_FILE
    base = OVERLAY11_FILE
    # HP helper 143b: above the dice cutoff, bp-7 is *assigned* one of three
    # constants chosen by the category jump table at CS:38f8 (11 words).
    fixed = []
    for word in struct.unpack_from("<11H", image, base + 0x38F8):
        at = base + word
        if image[at:at + 3] != b"\xc6\x46\xf9":
            raise ValueError("unexpected fixed-gain code")
        fixed.append(image[at + 3])
    # CON helper 3a5b: warrior bonus for CON 17..25 via the table at CS:3aab.
    extra = []
    for word in struct.unpack_from("<9H", image, base + 0x3AAB):
        at = base + word
        if image[at:at + 3] == b"\xfe\x46\xff":
            extra.append(1)
        elif image[at:at + 3] == b"\x80\x46\xff":
            extra.append(image[at + 3])
        else:
            raise ValueError("unexpected CON bonus code")
    return {
        "class_bit": tuple(image[dg + 0x63FA:dg + 0x63FA + 7]),
        "use_mask": tuple(image[dg + 0x63F3:dg + 0x63F3 + 7]),
        "cutoff": tuple(image[dg + 0x640A:dg + 0x640A + 7]),
        "first_dice": tuple(image[dg + 0x6411:dg + 0x6411 + 7]),
        "sides": tuple(image[dg + 0x6418:dg + 0x6418 + 7]),
        "con_table": tuple(image[dg + 0x82D:dg + 0x82D + 26]),
        "thac0": tuple(tuple(image[dg + 0x6359 + slot * 22:dg + 0x6359 + slot * 22 + 22])
                       for slot in range(7)),
        "fixed_gain": tuple(fixed),
        "con_extra": tuple(extra),
        # 25a4:1839 writes +0xc6: 1 for dwarves and kender, 2 otherwise.
        "race_size": {0: 2, 1: 2, 2: 2, 3: 1, 4: 1, 5: 1, 6: 2},
    }


@dataclass(frozen=True)
class DqkCharacterRules:
    thresholds: tuple[tuple[int, ...], ...]
    increments: tuple[int, ...]
    race_caps: tuple[tuple[int, ...], ...]
    source_sha256: str
    creation: dict | None = None

    @classmethod
    def from_executable(cls, image: bytes) -> DqkCharacterRules:
        if len(image) < DGROUP_FILE + 0x17DC + 49:
            raise ValueError("DQK executable is truncated")
        for start, end, expected in CODE_ANCHORS:
            if sha256(image[start:end]).hexdigest() != expected:
                raise ValueError(f"unsupported DQK helper bytes at file {start:#x}")
        rows = tuple(struct.unpack_from("<19I", image, DGROUP_FILE + 0x852 + row * 0x4C)
                     for row in range(11))
        increments = struct.unpack_from("<11I", image, DGROUP_FILE + 0x28C)
        caps = tuple(tuple(image[DGROUP_FILE + 0x17DC + race * 7:
                                DGROUP_FILE + 0x17DC + (race + 1) * 7])
                     for race in range(7))
        return cls(rows, increments, caps, sha256(image).hexdigest(),
                   _read_creation_tables(image))

    def threshold(self, record: bytes, slot: int, level: int) -> int:
        """Overlay-11 file 62B8C; levels 2..255 used by the training caller.

        Slots 0/1 of the table are not treated as creation defaults. The
        original helper returns signed LONG_MAX for byte levels >=41.
        """
        if not 2 <= level <= 255:
            raise ValueError("training threshold level must be 2..255")
        category = category_for_slot(record, slot)
        if level >= 41:
            return 0x7FFFFFFF
        if level < 18:
            return self.thresholds[category][level]
        return (self.thresholds[category][17] +
                (level - 17) * self.increments[category]) & 0xFFFFFFFF

    def level_cap(self, record: bytes, slot: int) -> int:
        _check_record(record)
        if not 0 <= slot < 7:
            raise ValueError("class slot must be 0..6")
        race = struct.unpack_from("<H", record, 0x58)[0]
        if race >= len(self.race_caps):
            raise ValueError("race must be 0..6")
        if slot == 1 and record[0x19A] == 3:
            return 40  # BBC5 bypasses the race table for Rose knights.
        return self.race_caps[race][slot]

    def ready_slots(self, record: bytes) -> tuple[int, ...]:
        """Training eligibility from 77E:1FE5 (BBC5); no mutation."""
        _check_record(record)
        xp = struct.unpack_from("<i", record, 0x44)[0]
        ready = []
        for slot, level in enumerate(record[0xA5:0xAC]):
            if not 0 < level < 40:
                continue
            threshold = self.threshold(record, slot, level + 1)
            if 0 < threshold <= 0x7FFFFFFF and xp >= threshold and level < self.level_cap(record, slot):
                ready.append(slot)
        return tuple(ready)

    # ---- creation path (2026-10-07) -------------------------------------
    def con_bonus(self, con: int, slot: int) -> int:
        """2b3a:3a5b. Returns the helper's AL, an UNSIGNED byte (254 = -2)."""
        t = self.creation
        if not 0 <= con < len(t["con_table"]):
            raise ValueError("CON out of table range 0..25")
        value = t["con_table"][con]
        if slot in (1, 2, 3, 4) and 17 <= con <= 25:
            value += t["con_extra"][con - 17]
        return value & 0xFF

    def hp_helper(self, record: bytearray, mask: int, divisor: int, rng,
                  mode: int = 1) -> None:
        """1d99:143b for mode 1 (grant). `rng(sides)` returns raw 0..sides-1.

        Byte arithmetic follows the original: rolled/fixed sum (bp-7) and
        CON accumulator (bp-5) are unsigned bytes, divided with unsigned
        idiv, and +0x89/+0xc0 wrap modulo 256.
        """
        if mode != 1:
            raise ValueError("only the grant mode (1) is modelled")
        t = self.creation
        roll_sum = 0
        con_sum = 0
        con = record[0x81]
        for slot in range(7):
            level = record[0xA5 + slot]
            if level == 0 or not (mask & t["class_bit"][slot]):
                continue
            if level < t["cutoff"][slot]:
                count = t["first_dice"][slot] if level <= 1 else 1
                totals = []
                for _ in range(2):
                    total = 0
                    for _ in range(count):
                        total += rng(t["sides"][slot]) + 1
                    totals.append(total & 0xFF)
                best = totals[1] if totals[1] > totals[0] else totals[0]
                roll_sum = (roll_sum + best) & 0xFF
                con_sum = (con_sum + self.con_bonus(con, slot) * count) & 0xFF
            else:
                category = category_for_slot(bytes(record), slot)
                roll_sum = t["fixed_gain"][category]   # assignment, as retail
        if divisor <= 0:
            record[0x198] = record[0xC0] = record[0x89] = 0
            return
        roll_sum = max(1, roll_sum // divisor)
        con_sum //= divisor
        deficit = (record[0x89] - record[0x198]) & 0xFF
        record[0xC0] = (record[0xC0] + roll_sum) & 0xFF
        record[0x89] = (record[0x89] + roll_sum + con_sum) & 0xFF
        record[0x198] = 0 if record[0x89] < deficit else record[0x89] - deficit

    def create_record(self, name: str, race: int, class_slots: tuple[int, ...],
                      rng, con: int | None = None, abilities=None,
                      deity: int = 0, robe: int = 1) -> bytes:
        """Single-class creation: 25a4:220a, class init 0dbf, the first-level
        HP call at 0x3c2b4 and the XP-driven loop at 2aa7:0022 in creation
        mode.  Returns the 414-byte physical record model."""
        t = self.creation
        if not 0 <= race < 7:
            raise ValueError("race must be 0..6")
        if not name or len(name) > 15 or not name.isascii():
            raise ValueError("name must be 1..15 ASCII characters")
        if len(class_slots) != 1:
            raise ValueError("only single-class creation is modelled")
        slot = class_slots[0]
        if not 0 <= slot < 7 or slot == 3:
            raise ValueError("class slot must be a creatable single class")
        abil = list(abilities or DEFAULT_ABILITIES)
        if con is not None:
            abil[4] = con
        rec = bytearray(RECORD_SIZE)
        struct.pack_into("<I", rec, 0x44, CREATION_XP)
        struct.pack_into("<H", rec, 0x58, race)
        struct.pack_into("<H", rec, 0x5A, slot)           # class word == slot
        rec[0x68:0x68 + len(name)] = name.encode("ascii")
        for index, value in enumerate(abil):
            rec[0x78 + index * 2] = rec[0x79 + index * 2] = value
        rec[0xC6] = t["race_size"][race]
        rec[0xA5 + slot] = 1
        if slot == 1:
            rec[0x19A] = 1                                  # Crown order
        if slot == 0:
            struct.pack_into("<H", rec, 0x19B, deity)
        if slot == 5:
            rec[0x19D] = robe
        if self.level_cap(bytes(rec), slot) < 2:
            raise ValueError("race cannot advance in this class")
        active = sum(1 for v in rec[0xA5:0xAC] if v)
        rec[0x198] = rec[0xC0] = rec[0x89] = 0
        self.hp_helper(rec, 0xFF, active, rng)
        for _ in range(64):                                 # loop 3c2e5 -> 3f512
            mask = 0
            for s in range(7):
                level = rec[0xA5 + s]
                if not level or self.level_cap(bytes(rec), s) <= level:
                    continue
                need = self.threshold(bytes(rec), s, level + 1)
                if 0 < need <= struct.unpack_from("<i", rec, 0x44)[0]:
                    mask |= t["class_bit"][s]
            if not mask:
                break
            for s in range(7):
                if rec[0xA5 + s] and (mask & t["class_bit"][s]):
                    rec[0xA5 + s] += 1
            self.hp_helper(rec, mask, active, rng)
        else:
            raise ValueError("levelling loop did not terminate")
        # Fields the importer and the roster projection need.
        level = [rec[0xA5 + s] for s in range(7)]
        rec[0x87] = max(t["thac0"][s][level[s]] for s in range(7) if level[s])
        rec[0xBF] = sum(t["use_mask"][s] for s in range(7) if level[s]) & 0xFF
        rec[0xB5], rec[0xB7], rec[0xBB] = 1, 2, 50          # unarmed 1d2, AC 10
        rec[0x90] = 12                                      # base movement
        rec[0x91] = max(level)                              # importer 'level'
        rec[0xCD] = 1 if self.ready_slots(bytes(rec)) else 0
        return bytes(rec)

    def inspect_record(self, record: bytes) -> dict:
        _check_record(record)
        classes = []
        ready = self.ready_slots(record)
        for slot, level in enumerate(record[0xA5:0xAC]):
            if not level:
                continue
            classes.append({"slot": slot, "class": CLASS_NAMES[slot], "level": level,
                            "category": CATEGORY_NAMES[category_for_slot(record, slot)],
                            "cap": self.level_cap(record, slot),
                            "next_xp": self.threshold(record, slot, level + 1) if level < 40 else None,
                            "ready": slot in ready})
        return {"name": record[0x68:0x78].split(b"\0", 1)[0].decode("ascii", errors="replace"),
                "xp": struct.unpack_from("<I", record, 0x44)[0], "classes": classes,
                "ready": bool(ready), "stored_ready": record[0xCD]}


def dice_stream(data: bytes):
    """Injectable dice shared with CCPARTY /D: raw = next byte % sides, wrapping."""
    if not data:
        raise ValueError("dice stream is empty")
    state = {"i": 0}

    def rng(sides: int) -> int:
        value = data[state["i"] % len(data)] % sides
        state["i"] += 1
        return value
    rng.state = state
    return rng


def asm_tables(rules: "DqkCharacterRules") -> str:
    """NASM data lines for native/src/dqkcreate.inc, derived from DQK.EXE.

    tools/test_dqk_character_rules.py requires every line to be present in the
    include file, so a table edit on either side turns a test red.
    """
    t = rules.creation

    def db(label, values, note):
        return f"{label} db {','.join(str(v) for v in values)}   ; {note}"

    out = [
        db("dqk_class_bit", t["class_bit"], "DS:63FA class-slot bit"),
        db("dqk_use_mask", t["use_mask"], "DS:63F3 item-use mask summed into +0BFh"),
        db("dqk_cutoff", t["cutoff"], "DS:640A dice cutoff level"),
        db("dqk_first_dice", t["first_dice"], "DS:6411 first-level dice count"),
        db("dqk_sides", t["sides"], "DS:6418 hit die sides (low bytes)"),
        db("dqk_con_table", t["con_table"], "DS:082D CON adjustment, CON 0..25"),
        db("dqk_con_extra", t["con_extra"], "CS:3AAB warrior bonus, CON 17..25"),
        db("dqk_fixed_gain", t["fixed_gain"], "CS:38F8 fixed gain above cutoff, category 0..10"),
        db("dqk_cat", (0, 3, 2, 10, 6, 7, 9), "creation category per slot (deity 0, order 1, robe 1)"),
        db("dqk_race_size", [t["race_size"][i] for i in range(7)], "25A4:1839 +0C6h by race"),
    ]
    for race in range(7):
        label = "dqk_race_caps" if race == 0 else f"dqk_race_caps_{race}"
        out.append(db(label, rules.race_caps[race], f"DS:17DC race {race}"))
    for slot in range(7):
        label = "dqk_thac0" if slot == 0 else f"dqk_thac0_{slot}"
        out.append(db(label, t["thac0"][slot], f"DS:6359 to-hit row, slot {slot}"))
    for cat in range(11):
        label = "dqk_thr" if cat == 0 else f"dqk_thr_{cat}"
        values = ",".join(f"0x{v:08x}" for v in rules.thresholds[cat][:18])
        out.append(f"{label} dd {values}   ; DS:0852 row {cat}, levels 0..17")
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, default=DEFAULT_EXE)
    parser.add_argument("--record", type=Path,
                        help="QCH/QSV containing a full physical character record")
    parser.add_argument("--emit-asm", action="store_true", help="print native table lines")
    parser.add_argument("--create", metavar="NAME", help="model a created character")
    parser.add_argument("--race", type=int, default=6)
    parser.add_argument("--class", dest="cls", default="fighter", choices=sorted(CREATE_CLASSES))
    parser.add_argument("--con", type=int)
    parser.add_argument("--dice", help="hex bytes for the injected dice stream")
    parser.add_argument("--out", type=Path, help="write the 414-byte record here")
    parser.add_argument("--offset", type=lambda value: int(value, 0), default=0,
                        help="explicit physical record start; not CCPARTY's shifted view")
    args = parser.parse_args()
    if args.emit_asm:
        sys.stdout.write(asm_tables(DqkCharacterRules.from_executable(args.exe.read_bytes())))
        return
    if args.create is not None:
        try:
            rules = DqkCharacterRules.from_executable(args.exe.read_bytes())
            rng = dice_stream(bytes.fromhex(args.dice or ""))
            rec = rules.create_record(args.create.upper(), args.race,
                                      (CREATE_CLASSES[args.cls],), rng, con=args.con)
        except (OSError, ValueError) as exc:
            parser.error(str(exc))
        if args.out:
            args.out.write_bytes(rec)
        print(json.dumps({"record_hex": rec.hex(), "xp": CREATION_XP,
                          "levels": list(rec[0xA5:0xAC]), "max_hp": rec[0x89],
                          "rolled_hp": rec[0xC0], "current_hp": rec[0x198],
                          "dice_used": rng.state["i"]}))
        return
    if args.record is None:
        parser.error("--record or --create is required")
    if args.offset < 0:
        parser.error("offset cannot be negative")
    try:
        rules = DqkCharacterRules.from_executable(args.exe.read_bytes())
        record = args.record.read_bytes()[args.offset:args.offset + RECORD_FIELD_SPAN]
        result = rules.inspect_record(record)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({"executable_sha256": rules.source_sha256,
                      "physical_record_offset": args.offset, **result}, indent=2))


if __name__ == "__main__":
    main()
