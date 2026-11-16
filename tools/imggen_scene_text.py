"""Scene text for AI restyling: the in-game text shown with each scene picture (CoK / DoK).

Gen1 ECL scripts (``ECL{1,2,3}.DAX``) show a picture with ``PICTURE`` (0x0E) and then print
narration with ``PRINT`` / ``PRINTCLEAR`` / ``PRINT_RETURN`` whose strings are inline 6-bit
packed (operand code 0x80).  This module disassembles every ECL block with the Gen1 opcode
table (a drift-checked copy of ``packages/engine/src/ecl/opcodes.ts``) plus the per-title
dialect overrides, walks forward from each PICTURE site along the script's control flow, and
collects the text printed while that picture is on screen (until the next picture, a menu or
input, combat, or the end of the script).

Output: ``renders/imggen/scene_text/<game>.json``; see :func:`lookup` and the CLI.

Honest limits (also written into each record's ``notes``): scripts branch on runtime state, so
the collected text is one static path, not a transcript of a play session; a picture id that
exists in several PICn files cannot be pinned to one file statically, so every candidate
family gets the same text and is flagged ``ambiguous_family``.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode  # noqa: E402

OUT_DIR = REPO / "renders" / "imggen" / "scene_text"

GAMES = {
    "cok": {"dir": "Champions of Krynn", "dialect": "gen1"},
    "dok": {"dir": "Death Knights of Krynn", "dialect": "dok"},
}

# opcode -> (wordSet, mnemonic, countAt)   (copy of KRYNN_GEN1_OPCODES; test guards drift)
OPS = {
    0x00: (0, "EXIT", None), 0x01: (1, "GOTO", None), 0x02: (1, "GOSUB", None),
    0x03: (2, "COMPARE", None), 0x04: (3, "ADD", None), 0x05: (3, "SUBTRACT", None),
    0x06: (3, "DIVIDE", None), 0x07: (3, "MULTIPLY", None), 0x08: (2, "RANDOM", None),
    0x09: (2, "SAVE", None), 0x0A: (1, "LOAD_CHARACTER", None), 0x0B: (3, "LOAD_MONSTER", None),
    0x0C: (3, "SETUP_MONSTER", None), 0x0D: (0, "APPROACH", None), 0x0E: (1, "PICTURE", None),
    0x0F: (2, "INPUT_NUMBER", None), 0x10: (2, "INPUT_STRING", None), 0x11: (1, "PRINT", None),
    0x12: (1, "PRINTCLEAR", None), 0x13: (0, "RETURN", None), 0x14: (4, "COMPARE_AND", None),
    0x15: (3, "VERTICAL_MENU", 2), 0x16: (0, "IF_EQ", None), 0x17: (0, "IF_NE", None),
    0x18: (0, "IF_LT", None), 0x19: (0, "IF_GT", None), 0x1A: (0, "IF_LE", None),
    0x1B: (0, "IF_GE", None), 0x1C: (0, "CLEARMONSTERS", None), 0x1D: (1, "PARTYSTRENGTH", None),
    0x1E: (6, "CHECKPARTY", None), 0x1F: (2, "UNKNOWN_1F", None), 0x20: (1, "NEWECL", None),
    0x21: (3, "LOAD_FILES", None), 0x22: (2, "PARTY_SURPRISE", None), 0x23: (4, "SURPRISE", None),
    0x24: (0, "COMBAT", None), 0x25: (2, "ON_GOTO", 1), 0x26: (2, "ON_GOSUB", 1),
    0x27: (8, "TREASURE", None), 0x28: (3, "ROB", None), 0x29: (14, "ENCOUNTER_MENU", None),
    0x2A: (3, "GETTABLE", None), 0x2B: (2, "HORIZONTAL_MENU", 1), 0x2C: (6, "PARLAY", None),
    0x2D: (1, "CALL", None), 0x2E: (5, "DAMAGE", None), 0x2F: (3, "AND", None),
    0x30: (3, "OR", None), 0x31: (0, "SPRITE_OFF", None), 0x32: (1, "FIND_ITEM", None),
    0x33: (0, "PRINT_RETURN", None), 0x34: (2, "ECL_CLOCK", None), 0x35: (3, "SAVE_TABLE", None),
    0x36: (2, "ADD_NPC", None), 0x37: (3, "LOAD_PIECES", None), 0x38: (1, "PROGRAM", None),
    0x39: (1, "WHO", None), 0x3A: (0, "DELAY", None), 0x3B: (3, "SPELL", None),
    0x3C: (1, "PROTECTION", None), 0x3D: (0, "CLEAR_BOX", None), 0x3E: (0, "DUMP", None),
    0x3F: (1, "FIND_SPECIAL", None), 0x40: (1, "DESTROY_ITEMS", None), 0x41: (2, "GEN1_AWARD_XP", None),
}

# DoK dialect (ECL_GEN1_SHORT_DOK in disassemble.ts): operand-count overrides + two new frames.
DOK_WORDSET = {0x0C: 4, 0x1D: 0, 0x22: 0, 0x23: 0, 0x2C: 1, 0x1F: 1, 0x29: 0}
DOK_OPS = {0x31: (2, "SHORT_MENU", 1), 0x27: (4, "TREASURE", 3)}

HEADER_LEN = 22
VBASE = 0x7FFE
MENU_OPS = {0x15, 0x2B}


def op_table(dialect: str) -> dict:
    t = dict(OPS)
    if dialect == "dok":
        for k, v in DOK_WORDSET.items():
            t[k] = (v, t[k][1], t[k][2])
        t.update(DOK_OPS)
    return t


def decode_string(raw: bytes) -> str:
    """6-bit MSB-first packed ECL string (0 terminates; 1..31 -> A..Z/@[..; 32..63 as-is)."""
    acc = bits = 0
    out = []
    for b in raw:
        acc = ((acc << 8) | b) & 0xFFFFFF
        bits += 8
        while bits >= 6:
            bits -= 6
            v = (acc >> bits) & 0x3F
            if v == 0:
                return "".join(out)
            out.append(chr(v + 64 if 1 <= v <= 31 else v))
    return "".join(out)


class Ins:
    __slots__ = ("off", "op", "name", "args", "size")

    def __init__(self, off, op, name, args, size):
        self.off, self.op, self.name, self.args, self.size = off, op, name, args, size


def decode_one(raw: bytes, off: int, table: dict) -> Ins | None:
    if not (HEADER_LEN <= off < len(raw)):
        return None
    spec = table.get(raw[off])
    if spec is None:
        return None
    word_set, name, count_at = spec
    pos = off + 1
    args = []  # (code, word, text|None)

    def opp() -> bool:
        nonlocal pos
        if pos + 2 > len(raw):
            return False
        code, high = raw[pos], raw[pos + 1]
        pos += 2
        text = None
        if code in (1, 2, 3, 0x81):
            if pos >= len(raw):
                return False
            word = high | (raw[pos] << 8)
            pos += 1
        else:
            word = high
        if code == 0x80:
            if pos + high > len(raw):
                return False
            text = decode_string(raw[pos:pos + high])
            pos += high
        args.append((code, word, text))
        return True

    for _ in range(word_set):
        if not opp():
            return None
    if count_at is not None:
        if count_at >= len(args):
            return None
        for _ in range(args[count_at][1]):
            if not opp():
                return None
    return Ins(off, raw[off], name, args, pos - off)


def entries(raw: bytes) -> list[int]:
    if len(raw) < HEADER_LEN or raw[:2] != b"\x88\x13":
        return []
    out = []
    for slot in range(5):
        v = int.from_bytes(raw[2 + slot * 4 + 2: 2 + slot * 4 + 4], "little")
        out.append(v - VBASE)
    return [o for o in out if HEADER_LEN <= o < len(raw)]


def goto_target(ins: Ins) -> int | None:
    if ins.args and ins.args[0][0] in (0, 1, 2, 3):
        t = ins.args[0][1] - VBASE
        return t if HEADER_LEN <= t else None
    return None


def reachable(raw: bytes, table: dict) -> dict[int, Ins]:
    """Instructions reachable from the five header entry points (GOTO/GOSUB/ON_* followed)."""
    seen: dict[int, Ins] = {}
    stack = list(entries(raw))
    while stack:
        off = stack.pop()
        while off not in seen:
            ins = decode_one(raw, off, table)
            if ins is None:
                break
            seen[off] = ins
            nxt = off + ins.size
            if ins.op in (0x00, 0x13, 0x20):
                break
            if ins.op == 0x23 and table[0x23][0] == 0:
                break
            if ins.op == 0x01:
                t = goto_target(ins)
                if t is None:
                    off = nxt
                    continue
                off = t
                continue
            if ins.op == 0x02:
                t = goto_target(ins)
                if t is not None:
                    stack.append(t)
            if ins.op in (0x25, 0x26):
                for a in ins.args[2:]:
                    if a[0] in (0, 1, 2, 3) and a[1] - VBASE >= HEADER_LEN:
                        stack.append(a[1] - VBASE)
            off = nxt
    return seen


def linear_map(raw: bytes, table: dict) -> dict[int, Ins]:
    """Linear sweep from the first instruction.  ECL routines are laid out back to back, and
    this covers ~99.8% of every block (the 5 header entry points alone reach only ~20%: the rest
    is entered through dynamic GOSUB/CALL ids), stopping at the first undecodable byte."""
    out: dict[int, Ins] = {}
    off = HEADER_LEN
    while off < len(raw):
        ins = decode_one(raw, off, table)
        if ins is None:
            break
        out[off] = ins
        off += ins.size
    return out


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\r", " ")).strip()


def collect_after(ins_map: dict[int, Ins], start: int, max_steps: int = 80):
    """Walk forward from `start` (the instruction after a PICTURE).

    Returns (segments, stop_reason, flags).  A new segment starts at each PRINTCLEAR (the game
    wipes the text window there).  GOTO is followed, GOSUB is followed and RETURN pops it.
    A conditional (IF_xx) guards only the next instruction; we take the guarded instruction as
    executed and flag the result `conditional`.
    """
    segs: list[str] = []
    cur: list[str] = []
    flags = {"conditional": False, "gosub": False, "var": False, "menu": []}
    off = start
    steps = 0
    guard_next = False
    visited = set()
    stack: list[int] = []
    stop = "end"

    def flush():
        nonlocal cur
        txt = clean_text("".join(cur))
        if txt:
            segs.append(txt)
        cur = []

    while steps < max_steps:
        ins = ins_map.get(off)
        if ins is None or off in visited:
            stop = "unreached"
            break
        visited.add(off)
        steps += 1
        nxt = off + ins.size
        guarded = guard_next
        guard_next = False
        op = ins.op
        if 0x16 <= op <= 0x1B:
            guard_next = True
            off = nxt
            continue
        if op == 0x0E:
            stop = "next-picture"
            break
        if op in (0x00, 0x20, 0x24) or (op == 0x23 and ins.size == 1):
            stop = ins.name.lower()
            break
        if op == 0x13:
            if stack:
                off = stack.pop()
                continue
            stop = "return"
            break
        if op in MENU_OPS or ins.name == "SHORT_MENU":
            first = 3 if op == 0x15 else 2
            flags["menu"] = [clean_text(a[2]) for a in ins.args[first:] if a[2]]
            stop = "menu"
            break
        if op in (0x0F, 0x10, 0x25, 0x26):
            stop = ins.name.lower()
            break
        if op in (0x11, 0x12, 0x33):
            if guarded:
                flags["conditional"] = True
            if op == 0x12:
                flush()
            if op in (0x11, 0x12) and ins.args:
                a = ins.args[0]
                if a[0] == 0x80:
                    cur.append(a[2] or "")
                else:
                    flags["var"] = True
                    cur.append("[var]")
            if op == 0x33:
                cur.append(" ")
            off = nxt
            continue
        if op == 0x01:
            t = goto_target(ins)
            off = nxt if t is None else t
            continue
        if op == 0x02:
            t = goto_target(ins)
            if t is not None and len(stack) < 4:
                stack.append(nxt)
                flags["gosub"] = True
                off = t
                continue
        off = nxt
    flush()
    return segs, stop, flags


# --------------------------------------------------------------------------------------------
# Picture families
# --------------------------------------------------------------------------------------------

def game_dir(game: str) -> Path:
    return REPO / GAMES[game]["dir"]


def _dax_files(game: str, prefix: str) -> list[Path]:
    out = {}
    for p in game_dir(game).iterdir():
        if p.suffix.upper() == ".DAX" and re.fullmatch(prefix + r"\d+", p.stem.upper()):
            out[p.stem.upper()] = p
    return [out[k] for k in sorted(out)]


def picture_families(game: str) -> dict[str, list[int]]:
    """{'PIC2': [block ids], 'BIGPIC1': [...]} for every scene-picture DAX the game ships."""
    fam: dict[str, list[int]] = {}
    for prefix in ("BIGPIC", "PIC"):
        for p in _dax_files(game, prefix):
            _, blks = dax_decode.parse_container(p.read_bytes())
            fam[p.stem.upper()] = sorted({b.block_id for b in blks})
    return fam


def ecl_blocks(game: str):
    """Yield (ecl_file_number, block_id, raw) for every ECL block of the game."""
    for p in _dax_files(game, "ECL"):
        n = int(re.search(r"\d+", p.stem)[0])
        data = p.read_bytes()
        base, blks = dax_decode.parse_container(data)
        for blk in blks:
            yield n, blk.block_id, dax_decode.decompress_block(data, base, blk)


AREA_ADDR = 0x7F12  # SAVE #n -> [0x7F12] sets game_area (docs/engine/research/ecl-krynn-gen1-opcodes.md)


def _predecessor_text(ins_map: dict[int, Ins], pic: Ins) -> str:
    """Text printed by the contiguous print-family instructions directly before `pic` in memory."""
    ends = {i.off + i.size: i for i in ins_map.values()}
    parts: list[str] = []
    cur = ends.get(pic.off)
    guard = 0
    while cur is not None and cur.op in (0x11, 0x12, 0x33) and guard < 8:
        if cur.op == 0x33:
            parts.append(" ")
        elif cur.args and cur.args[0][0] == 0x80:
            parts.append(cur.args[0][2] or "")
        guard += 1
        if cur.op == 0x12:
            break
        cur = ends.get(cur.off)
    return clean_text("".join(reversed(parts)))


def classify_text(text: str, menu: list[str]) -> str:
    if not text:
        return "none"
    quotes = text.count("'") + text.count('"')
    if re.search(r"\b(BUY|SELL|PAY|ENTER)\b.*\?$", text) or (menu and len(text) < 60):
        return "prompt"
    if quotes >= 2:
        return "dialogue-mixed"
    return "narration"


def family_candidates(pid: int, ecl_n: int, fams: dict[str, list[int]]) -> tuple[list[str], str]:
    """Which PIC/BIGPIC files hold id `pid`; prefer the file numbered like the ECL file."""
    holders = [f for f, ids in fams.items() if pid in ids]
    pref = [f for f in holders if f.endswith(str(ecl_n))]
    if len(holders) <= 1:
        return holders, "unique" if holders else "missing"
    if len(pref) == 1:
        return pref, "ecl-number-match"
    return holders, "ambiguous"


def build_game(game: str) -> dict:
    table = op_table(GAMES[game]["dialect"])
    fams = picture_families(game)
    pictures: dict[str, dict[str, list[dict]]] = {f: {str(i): [] for i in ids} for f, ids in fams.items()}
    orphans: list[dict] = []
    sites = dyn = clears = 0
    for ecl_n, blk_id, raw in ecl_blocks(game):
        im = linear_map(raw, table)
        entry_reach = reachable(raw, table)
        area_writes = sorted({i.args[0][1] for i in im.values() if i.op == 9 and len(i.args) == 2
                              and i.args[1][0] in (1, 2, 3) and i.args[1][1] == AREA_ADDR and i.args[0][0] == 0})
        for pic in sorted((i for i in im.values() if i.op == 0x0E), key=lambda i: i.off):
            a = pic.args[0]
            if a[0] != 0:
                dyn += 1
                continue
            pid = a[1]
            if pid == 0xFF:
                clears += 1
                continue
            sites += 1
            segs, stop, fl = collect_after(im, pic.off + pic.size)
            pre = _predecessor_text(im, pic)
            notes = []
            used_pre = False
            if not segs and pre:
                segs, used_pre = [pre], True
                notes.append("text taken from print instructions immediately BEFORE the PICTURE (lower confidence)")
            text = " / ".join(segs)
            fl_menu = fl["menu"]
            if fl_menu:
                notes.append("followed by menu: " + ", ".join(fl_menu))
            if fl["conditional"]:
                notes.append("includes text guarded by a runtime condition (IF_xx)")
            if fl["gosub"]:
                notes.append("text gathered through a GOSUB")
            if fl["var"]:
                notes.append("contains [var]: a PRINT of a runtime string (name/number) not statically known")
            holders, how = family_candidates(pid, ecl_n, fams)
            kind = classify_text(text, fl_menu)
            if kind == "dialogue-mixed":
                notes.append("contains quoted speech: dialogue, not pure scene description")
            if kind == "prompt":
                notes.append("short prompt/menu line rather than scene description")
            if stop in ("unreached", "return", "end") and text:
                notes.append("script path ends/branches here (%s); later text may exist" % stop)
            if how == "ambiguous":
                notes.append("picture id exists in several files (%s); cannot tell statically which is shown" % ", ".join(holders))
            if pic.off not in entry_reach:
                notes.append("PICTURE not reachable from the 5 header entries by static flow (entered via dynamic GOSUB/CALL)")
            if len(area_writes) > 1:
                notes.append("block writes game_area %s" % area_writes)
            if not text:
                conf = "none"
            else:
                conf = "high"
                if how == "ambiguous" or fl["conditional"] or fl["gosub"] or fl["var"] or kind == "prompt" or stop in ("unreached", "end"):
                    conf = "medium"
                if used_pre or len(text) < 25:
                    conf = "low"
            rec = {"ecl_file": "ECL%d.DAX" % ecl_n, "ecl_block": blk_id, "area": ecl_n, "ecl_offset": pic.off,
                   "text": text, "segments": segs, "kind": kind, "stop": stop, "confidence": conf,
                   "family_resolution": how, "notes": notes}
            if not holders:
                orphans.append({"picture_id": pid, **rec})
                continue
            for f in holders:
                bucket = pictures[f][str(pid)]
                if not any(r["ecl_block"] == blk_id and r["ecl_file"] == rec["ecl_file"] and r["text"] == text for r in bucket):
                    bucket.append(dict(rec))
    for d in pictures.values():  # drop text-less records where a texted one exists; keep one 'none' marker
        for pid, recs in d.items():
            texted = [r for r in recs if r["text"]]
            d[pid] = texted if texted else recs[:1]
    total = sum(len(d) for d in pictures.values())
    with_text = sum(1 for d in pictures.values() for recs in d.values() if any(r["text"] for r in recs))
    stats = {"pictures_total": total, "with_text": with_text, "without_text": total - with_text,
             "picture_sites": sites, "dynamic_id_sites": dyn, "clear_sites": clears,
             "orphan_ids": sorted({o["picture_id"] for o in orphans}),
             "by_family": {f: {"total": len(d), "with_text": sum(1 for recs in d.values() if any(r["text"] for r in recs))}
                           for f, d in pictures.items()}}
    return {"game": game, "tool": "tools/imggen_scene_text.py", "stats": stats, "pictures": pictures,
            "orphans": orphans,
            "limits": ["static walk of ECL: one path per PICTURE site, not a play transcript",
                       "PIC/BIGPIC file chosen by ECL file number when the id is in several files",
                       "HEAD/BODY (NPC portrait) pictures are not modelled; PIC ids shown beside a head use the PIC path"]}


def write_all(out_dir: Path = OUT_DIR) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    res = {}
    for g in GAMES:
        data = build_game(g)
        (out_dir / f"{g}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        res[g] = data["stats"]
    return res


_CACHE: dict[tuple[str, str], dict] = {}


def load(game: str, out_dir: Path = OUT_DIR) -> dict:
    key = (game, str(out_dir))
    if key not in _CACHE:
        p = out_dir / f"{game}.json"
        _CACHE[key] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else build_game(game)
    return _CACHE[key]


def lookup(game: str, family: str, block_id: int, out_dir: Path = OUT_DIR) -> list[dict]:
    """Records (possibly empty list) for picture `block_id` of `family` (e.g. 'PIC2', 'BIGPIC1').

    Raises KeyError for an unknown game/family/id so a typo is never mistaken for 'no text'.
    """
    game = game.lower()
    if game not in GAMES:
        raise KeyError(f"unknown game {game!r}")
    pics = load(game, out_dir)["pictures"]
    fam = family.upper()
    if fam not in pics:
        raise KeyError(f"unknown family {family!r} for {game}; have {sorted(pics)}")
    if str(int(block_id)) not in pics[fam]:
        raise KeyError(f"{fam} has no block {block_id}")
    return pics[fam][str(int(block_id))]


def lookup_by_id(game: str, block_id: int, out_dir: Path = OUT_DIR) -> dict[str, list[dict]]:
    """{family: records} for every PIC/BIGPIC file holding `block_id`.

    Use this for Amiga renders: Amiga PIC1.DAA etc. bundle pictures differently from the DOS
    PICn.DAX files, but the block ids are shared (renders/amiga_cokdok/twins.json), so the id is
    the stable key.  Several families => same id in several DOS files (see family_resolution).
    """
    pics = load(game.lower(), out_dir)["pictures"]
    return {f: d[str(int(block_id))] for f, d in pics.items() if str(int(block_id)) in d}


def best_text(game: str, family: str, block_id: int, **kw) -> str:
    """Highest-confidence text for a picture, or ''."""
    rank = {"high": 3, "medium": 2, "low": 1, "none": 0}
    recs = [r for r in lookup(game, family, block_id, **kw) if r["text"]]
    return max(recs, key=lambda r: (rank[r["confidence"]], len(r["text"])))["text"] if recs else ""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="write renders/imggen/scene_text/{cok,dok}.json")
    q = sub.add_parser("lookup", help="show text for one picture")
    q.add_argument("game", choices=sorted(GAMES))
    q.add_argument("family", help="e.g. PIC2 or BIGPIC1")
    q.add_argument("block_id", type=int)
    f = sub.add_parser("find", help="text for a picture id in any family (Amiga renders)")
    f.add_argument("game", choices=sorted(GAMES))
    f.add_argument("block_id", type=int)
    sub.add_parser("stats", help="print coverage counts from the built JSON")
    a = ap.parse_args(argv)
    if a.cmd == "build":
        print(json.dumps(write_all(), indent=1))
    elif a.cmd == "stats":
        for g in GAMES:
            print(g, json.dumps(load(g)["stats"], indent=1))
    elif a.cmd == "find":
        found = lookup_by_id(a.game, a.block_id)
        if not found:
            print("error: id not in any family", file=sys.stderr)
            return 2
        for fam, recs in found.items():
            print(f"== {fam}: {sum(1 for r in recs if r['text'])} text record(s)")
            for r in recs:
                if r["text"]:
                    print(f"[{r['confidence']}/{r['kind']}] {r['ecl_file']}#{r['ecl_block']}: {r['text']}")
    else:
        try:
            recs = lookup(a.game, a.family, a.block_id)
        except KeyError as e:
            print("error:", e.args[0], file=sys.stderr)
            return 2
        if not recs:
            print("(no ECL text found for this picture)")
        for r in recs:
            print(f"[{r['confidence']}/{r['kind']}] {r['ecl_file']}#{r['ecl_block']} @0x{r['ecl_offset']:x}: {r['text']}")
            for n in r["notes"]:
                print("   note:", n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
