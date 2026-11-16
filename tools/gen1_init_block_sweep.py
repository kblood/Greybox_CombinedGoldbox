#!/usr/bin/env python3
"""Static init-block bootability sweep for Gen1 short-dialect titles (Pools, Treasures).

Method (no VM, no DOSBox): for every ECL block id that is ALSO a GEO block id, decode the
whole control-flow graph reachable from the header initial_entry (offset 22, the VM default pc) with the title's own
word-set dict, and count bytes the decoder refuses (a desync).  A block is CLEAN when it has
zero refused offsets, at least one reachable EXIT (0x00), and every reachable LOAD_FILES
names a GEO id that exists.  CLEAN is a necessary condition, not a selection rule: for Treasures
the lowest CLEAN id (20) is the init block (`gameData.ts`), but for Pools the lowest CLEAN id is 1
(28 blocks are clean) while the chosen init block is 18, picked on decoded content
(`pools-of-darkness-eclinit.md` section 3; block 16 needs an INPUT_STRING pause).  The printed
`lowest=` is therefore only the lowest candidate.
The control is the DIALECT: the same blocks under the plain 3-operand LOAD_FILES frame.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen1_ecl_encounter_scan as scan  # noqa: E402
import dax_decode  # noqa: E402

GOG = Path(r"C:\Program Files (x86)\GOG Galaxy\Games")
TITLES = {
    "pools-of-darkness": GOG / "Pools of Darkness",
    "treasures-of-the-savage-frontier": GOG / "Treasures of the Savage Frontier",
}


def blocks(path: Path) -> dict[int, bytes]:
    data = path.read_bytes()
    parsed = dax_decode.parse_container(data)
    base, toc = parsed
    return {b.block_id: dax_decode.decompress_block(data, base, b) for b in toc}


def analyse(raw: bytes, word_sets: dict[int, int], profile: str) -> dict:
    opcodes = scan.opcodes_for_profile(profile)
    entries = dict(scan.header_entries(raw))
    start = entries.get("initial_entry")
    seen: set[tuple[int, tuple[int, ...]]] = set()
    refused: set[int] = set()
    exits = 0
    loadfiles: list[int] = []
    q: deque = deque([(start, ())] if start is not None else [])
    while q and len(seen) < 20000:
        off, stack = q.popleft()
        if (off, stack[-4:]) in seen:
            continue
        seen.add((off, stack[-4:]))
        ins = scan.decode_one(raw, off, word_sets, opcodes)
        if ins is None:
            refused.add(off)
            continue
        if ins.opcode == 0x00:
            exits += 1
        if ins.opcode == 0x21 and ins.args and ins.args[0].code == 0:
            loadfiles.append(ins.args[0].word)
        for tgt, tstack, _d, _o in scan.successors(raw, ins, stack, 0x8000, scan.ALL_COMPARE_OUTCOMES, word_sets, opcodes):
            if scan.ECL_HEADER_LEN <= tgt < len(raw) and len(tstack) <= 24:
                q.append((tgt, tstack))
    return {"entry": start, "refused": len(refused), "exits": exits, "loadfiles": sorted(set(loadfiles))}


def sweep(profile: str, root: Path, long_frame: bool = False) -> dict:
    ecl, geo = blocks(root / "ECL1.DAX"), blocks(root / "GEO1.DAX")
    ws = dict(scan.PROFILE_WORD_SETS[profile])
    if long_frame:
        ws[0x21] = 3
    out = {}
    for bid in sorted(set(ecl) & set(geo)):
        r = analyse(ecl[bid], ws, profile)
        r["clean"] = bool(r["refused"] == 0 and r["loadfiles"] and all(g in geo for g in r["loadfiles"]))
        out[bid] = r
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    res = {}
    for profile, root in TITLES.items():
        if not root.is_dir():
            print(f"SKIP: {root} absent")
            return
        a, b = sweep(profile, root), sweep(profile, root, True)
        res[profile] = {"short": a, "long": b}
        ca = [k for k, v in a.items() if v["clean"]]
        cb = [k for k, v in b.items() if v["clean"]]
        print(f"{profile}: paired={len(a)} clean(short2)={ca} lowest={ca[0] if ca else None}")
        print(f"{profile}: clean(long LOAD_FILES 3op)={cb}")
    if args.json:
        print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
