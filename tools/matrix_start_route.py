#!/usr/bin/env python3
"""Derive Buck Rogers: Matrix Cubed's real startup route from its own retail bytes (read-only).

`docs/engine/NATIVE-TASKS-2026-09-12.md` item 56 records that the native GBBOOT treats any
matching `GEO*.DAX` as a fallback and uses ECL block 34 as a "verified" area-1 smoke entry,
without a derivation of the title's own startup archive and block ids. This module derives them
from the installed bytes alone -- `GAME.OVR` (the overlay that holds the boot selector and the
archive-name builders), `ECL1.DAX`, `GEO1.DAX`, `WALLDEF1.DAX`, `8X8D1.DAX` -- plus the
EXEPACK-unpacked resident image of `START.EXE`. Nothing is written, no DOSBox is run.

THE DERIVATION (every step is a byte or decode fact, no value is inherited from another title)

1. BOOT SELECTOR. CoAB's `sub_29758` (`coab_extracted/engine/ovr003.cs`) picks the first ECL
   block as `inDemo ? 0x52 : 1` when `LastEclBlockId == 0`. Matrix Cubed is compiled differently
   and carries different constants, so the 0x52/1 pair is NOT searched for (it is absent: zero
   `mov byte [m],0x52` sites in `GAME.OVR`). The Matrix analogue is the single byte-exact site

       80 3E <demo> 00 74 xx  C6 06 <var> <demo_id>  C6 06 <x> 04  EB xx  C6 06 <var> <new_id>

   i.e. `cmp byte [demo],0 / je / mov [var],demo_id / mov [x],4 / jmp / mov [var],new_id`, which
   is followed by `mov al,[var] / push ax / lcall 0x6b:0x34` (the ECL block loader). That site
   writes demo_id = 0x18 (24) and new-game id = 0x10 (16). The regex matches exactly once in the
   212,529-byte overlay; the loose "two different non-zero byte stores to one address within 24
   bytes across a jmp" shape matches 16 times (see `loose_pair_sites`), so the strict shape is
   what carries the evidence, not the pair idea.

2. ARCHIVE NAMES. The overlay builds `ECL<area>.dax`, `GEO<area>.dax` and `WALLDEF<area>.dax`
   from three Pascal literals (`03 'ECL' 04 '.dax'`, `03 'GEO' 04 '.dax'`, `07 'WALLDEF' 04 '.dax'`)
   plus a decimal conversion of the byte `ds:[0x50D2]` read inside each builder. The three
   builders' windows share exactly one `mov al,[addr]` address, 0x50D2 = game_area. Every
   non-transient store to it is 1 (two new-game initialisers also store `[0x50D3]=1`); the one
   other immediate, 6, is a transient: the prior value is saved to `[0x3DDB]` immediately before.
   Only `ECL1.DAX`, `GEO1.DAX`, `WALLDEF1.DAX` are installed, so area 1 is the only loadable one.

3. THE SCRIPT CHAIN. ECL1 block 16 (33 raw bytes) decodes cleanly to `SAVE 1 -> [0x7F12]`
   (game_area, the same ECL address Gateway's route tool names) then `NEWECL 19`. Block 19's
   reachable `LOAD_FILES` names GEO block 17 and its `LOAD_PIECES` WALLDEF/8X8D set 5. The demo
   block 24 loads GEO 64 / set 7.

WHAT IS NOT DERIVED HERE (kept honest): which map squares raise which later ECL events (GEO
cell bytes against the 0x4BF2 EclBlockId dispatch) and any DOSBox-observed runtime confirmation.
The ECL dialect is Buck's measured word-set table plus the 0x41..0x4C extension frames from
`ECL_GEN1_MATRIX` (`packages/engine/src/ecl/disassemble.ts`); every block reached by this route
decodes with zero truncated offsets, and the tool reports the per-block truncation counts of the
others rather than hiding them.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import dax_decode  # noqa: E402
import dax_inspect  # noqa: E402
import gen1_ecl_encounter_scan as scan  # noqa: E402
from dqk_ca03_stream_decode import Opcode  # noqa: E402

REPO_ROOT = TOOLS.parent
ECL_BASE = 0x7FFE
GAME_AREA_ECL_ADDR = 0x7F12
ECL_BLOCK_ID_ECL_ADDR = 0x4BF2
NO_MAP = (0x7F, 0xFF)

# Matrix's own extension frames, mirrored from `ECL_GEN1_MATRIX.opcodeOverrides`.
MATRIX_EXTENSIONS: dict[int, Opcode] = {
    0x31: Opcode(2, "SHORT_MENU", count_at=1),
    0x41: Opcode(2, "BUCK_EXT_41"), 0x42: Opcode(0, "BUCK_EXT_42"),
    0x43: Opcode(1, "BUCK_EXT_43"), 0x44: Opcode(0, "BUCK_EXT_44"),
    0x45: Opcode(2, "BUCK_EXT_45"), 0x46: Opcode(2, "BUCK_EXT_46"),
    0x47: Opcode(0, "BUCK_EXT_47"), 0x48: Opcode(1, "BUCK_EXT_48"),
    0x49: Opcode(6, "BUCK_EXT_49"), 0x4A: Opcode(0, "BUCK_EXT_4A"),
    0x4B: Opcode(1, "BUCK_EXT_4B"), 0x4C: Opcode(2, "BUCK_EXT_4C"),
}
WORD_SETS = scan.GEN1_BUCK_WORD_SETS
OPCODES = {**scan.OPCODES, **MATRIX_EXTENSIONS}

BOOT_RE = re.compile(
    rb"\x80\x3E(..)\x00\x74.\xC6\x06(..)([\x01-\xff])\xC6\x06(..)\x04\xEB.\xC6\x06\2([\x01-\xff])",
    re.S,
)
LOOSE_STORE_RE = re.compile(rb"\xC6\x06(..)([\x01-\xff])", re.S)
NAME_LITERALS = {
    "ECL": b"\x03ECL\x04.dax",
    "GEO": b"\x03GEO\x04.dax",
    "WALLDEF": b"\x07WALLDEF\x04.dax",
}


class RouteError(ValueError):
    """The named route cannot be derived (a reject, never a silent fallback)."""


# --------------------------------------------------------------------------- file access

def find_matrix_dir() -> Path | None:
    """`GB_MATRIX_DIR`, else `matrixcubed_extracted/BuckRogers2/c/Matrix` in this checkout or any
    parent (a worktree lives under the main checkout, where the git-ignored extraction is)."""
    import os

    env = os.environ.get("GB_MATRIX_DIR")
    candidates = [Path(env)] if env else []
    for root in [REPO_ROOT, *REPO_ROOT.parents]:
        candidates.append(root / "matrixcubed_extracted" / "BuckRogers2" / "c" / "Matrix")
    for cand in candidates:
        if (cand / "GAME.OVR").is_file() and (cand / "ECL1.DAX").is_file():
            return cand
    return None


def read_dax(data: bytes) -> dict[int, bytes]:
    base, entries = dax_inspect.parse_toc(data)
    problems = dax_inspect.verify(data, base, entries)
    if problems:
        raise RouteError(f"DAX offset chain does not close: {problems[:2]}")
    out: dict[int, bytes] = {}
    for e in entries:
        start = base + e["data_offset"]
        out[e["block_id"]] = dax_decode.rle_decode(data[start:start + e["comp_size"]], e["raw_size"])
    return out


def load_files(matrix_dir: Path) -> dict[str, bytes]:
    names = ["GAME.OVR", "ECL1.DAX", "GEO1.DAX", "WALLDEF1.DAX", "8X8D1.DAX", "MATRIX.CFG", "START.EXE"]
    return {n: (matrix_dir / n).read_bytes() for n in names}


# --------------------------------------------------------------------------- overlay facts

def boot_selector(ovr: bytes) -> dict[str, Any]:
    matches = list(BOOT_RE.finditer(ovr))
    if len(matches) != 1:
        raise RouteError(f"boot selector shape matched {len(matches)} times, expected exactly 1")
    m = matches[0]
    demo_flag, var, demo_id, _scratch, new_id = m.group(1), m.group(2), m.group(3)[0], m.group(4), m.group(5)[0]
    loader = b"\xA0" + var + b"\x50\x9A\x34\x00\x6B\x00"
    follow = ovr.find(loader, m.end(), m.end() + 0x80)
    return {
        "site": m.start(),
        "demo_flag_ds": int.from_bytes(demo_flag, "little"),
        "ecl_block_var_ds": int.from_bytes(var, "little"),
        "demo_block": demo_id,
        "new_game_block": new_id,
        "loader_call_offset": follow if follow >= 0 else None,
        "strict_matches": len(matches),
    }


def loose_pair_sites(ovr: bytes) -> int:
    """Null for the boot shape: two different non-zero byte stores to one address within 24
    bytes across a short jump. Many sites qualify; the strict shape selects one."""
    count = 0
    for m in LOOSE_STORE_RE.finditer(ovr):
        seg = ovr[m.end():m.end() + 24]
        k = seg.find(b"\xC6\x06" + m.group(1))
        if k >= 0 and k + 4 < len(seg) and seg[k + 4] not in (0, m.group(2)[0]) and b"\xEB" in seg[:k]:
            count += 1
    return count


def archive_naming(ovr: bytes) -> dict[str, Any]:
    windows: dict[str, set[int]] = {}
    literal_offsets: dict[str, list[int]] = {}
    for name, lit in NAME_LITERALS.items():
        offs = [m.start() for m in re.finditer(re.escape(lit), ovr)]
        literal_offsets[name] = offs
        if len(offs) != 1:
            raise RouteError(f"{name} name literal found {len(offs)} times, expected 1")
        lo = max(0, offs[0] - 0xA0)
        win = ovr[lo:offs[0] + 0x80]
        windows[name] = {int.from_bytes(win[i + 1:i + 3], "little") for i in range(len(win) - 2) if win[i] == 0xA0}
    common = set.intersection(*windows.values())
    if len(common) != 1:
        raise RouteError(f"archive builders share {len(common)} area-variable candidates, expected 1")
    area = next(iter(common))
    lo_hi = area.to_bytes(2, "little")
    imm = [(m.start(), ovr[m.start() + 4]) for m in re.finditer(rb"\xC6\x06" + re.escape(lo_hi), ovr)]
    # Transient shape: `mov al,[area]` / `mov [save],al` immediately before `mov byte [area],imm`.
    transient6 = [off for off, v in imm if v == 6 and ovr[off - 6:off - 5] == b"\xA0" and ovr[off - 3:off - 2] == b"\xA2"]
    return {
        "area_var_ds": area,
        "literal_offsets": {k: v[0] for k, v in literal_offsets.items()},
        "candidate_counts": {k: len(v) for k, v in windows.items()},
        "immediate_stores": imm,
        "stores_of_1": sum(1 for _, v in imm if v == 1),
        "transient6_sites": transient6,
        "saved_before_6": bool(transient6),
        "unsaved_nonone_nonzero": [(off, v) for off, v in imm if v not in (0, 1) and off not in transient6],
    }


# --------------------------------------------------------------------------- ECL decoding

def flow(raw: bytes) -> dict[str, Any]:
    """Statically reachable instructions from the initial entry (all branch outcomes taken)."""
    if raw[:2] != b"\x88\x13":
        raise RouteError("ECL block lacks the 0x1388 magic")
    entries = dict(scan.header_entries(raw))
    if "initial_entry" not in entries:
        raise RouteError("ECL block has no initial entry")
    seen: set[tuple[int, tuple[int, ...]]] = set()
    stack_q: list[tuple[int, tuple[int, ...]]] = [(entries["initial_entry"], ())]
    res: dict[str, Any] = {"newecl": [], "load_files": [], "load_pieces": [], "area": [],
                           "instructions": 0, "truncated": 0, "first": None}
    while stack_q:
        off, stk = stack_q.pop()
        if (off, stk[-4:]) in seen:
            continue
        seen.add((off, stk[-4:]))
        ins = scan.decode_one(raw, off, WORD_SETS, OPCODES)
        if ins is None:
            res["truncated"] += 1
            continue
        res["instructions"] += 1
        args = [(o.code, o.word) for o in ins.args]
        if res["first"] is None:
            res["first"] = (ins.mnemonic, args)
        if ins.opcode == 0x20:
            res["newecl"].append((off + ECL_BASE, args[0]))
        elif ins.opcode == 0x21:
            res["load_files"].append((off + ECL_BASE, args))
        elif ins.opcode == 0x37:
            res["load_pieces"].append((off + ECL_BASE, args))
        elif ins.opcode == 0x09 and len(args) > 1 and args[1][1] == GAME_AREA_ECL_ADDR:
            res["area"].append((off + ECL_BASE, args[0]))
        for tgt, nstk, _why, _o in scan.successors(raw, ins, stk, 0x8000, scan.ALL_COMPARE_OUTCOMES, WORD_SETS, OPCODES):
            if scan.ECL_HEADER_LEN <= tgt < len(raw) and len(nstk) <= 24:
                stack_q.append((tgt, nstk))
    return res


def self_id_guard(raw: bytes, block_id: int) -> bool:
    """Initial entry opens `COMPARE <block_id>, [0x4BF2]` (either operand order)."""
    entry = dict(scan.header_entries(raw)).get("initial_entry")
    ins = scan.decode_one(raw, entry, WORD_SETS, OPCODES) if entry else None
    if ins is None or ins.mnemonic != "COMPARE" or len(ins.args) < 2:
        return False
    a, b = [(o.code, o.word) for o in ins.args[:2]]
    return {a, b} == {(0, block_id), (1, ECL_BLOCK_ID_ECL_ADDR)}


# --------------------------------------------------------------------------- the route

def derive_route(
    ovr: bytes,
    ecl: dict[int, bytes],
    geo: dict[int, bytes],
    walldef: dict[int, bytes],
    d8x8: dict[int, bytes],
) -> dict[str, Any]:
    boot = boot_selector(ovr)
    naming = archive_naming(ovr)
    if naming["unsaved_nonone_nonzero"]:
        raise RouteError(f"game_area has non-transient stores other than 1: {naming['unsaved_nonone_nonzero']}")
    if not naming["saved_before_6"]:
        raise RouteError("the area-6 store is not the save-then-set transient shape")
    for label in ("new_game_block", "demo_block"):
        if boot[label] not in ecl:
            raise RouteError(f"boot {label} {boot[label]} is not a block of ECL1.DAX")

    flows = {bid: flow(raw) for bid, raw in ecl.items()}

    # Walk the immediate NEWECL chain from the new-game block (game_area stays 1: every area
    # write is immediate 1 and only ECL1 is installed, so a NEWECL operand names an ECL1 block).
    order = [boot["new_game_block"]]
    edges = []
    i = 0
    while i < len(order):
        bid = order[i]
        i += 1
        for addr, (code, word) in flows[bid]["newecl"]:
            if code != 0:
                edges.append({"from": bid, "vaddr": addr, "target": None, "dynamic": True})
                continue
            if word not in ecl:
                raise RouteError(f"block {bid} NEWECL {word} names a block absent from ECL1.DAX")
            edges.append({"from": bid, "vaddr": addr, "target": word, "dynamic": False})
            if word not in order:
                order.append(word)

    first_map = None
    for bid in order:
        for addr, args in flows[bid]["load_files"]:
            if args[0][0] == 0 and args[0][1] not in NO_MAP:
                first_map = (bid, addr, args[0][1])
                break
        if first_map:
            break
    if first_map is None:
        raise RouteError("no block on the new-game chain loads a GEO map")
    map_block = first_map[2]
    site_geos = sorted({a[0][1] for _, a in flows[first_map[0]]["load_files"] if a[0][0] == 0 and a[0][1] not in NO_MAP})
    if site_geos != [map_block]:
        raise RouteError(f"block {first_map[0]} names several GEO ids {site_geos}; start map is ambiguous")
    if map_block not in geo or len(geo[map_block]) != 1026:
        raise RouteError(f"start map GEO block {map_block} is not a 1026-byte GEO1.DAX member")
    pieces = [a for a in flows[first_map[0]]["load_pieces"] if a[1][0][0] == 0 and a[1][0][1] not in NO_MAP]
    wall_sets = sorted({p[1][0][1] for p in pieces})
    if len(wall_sets) != 1:
        raise RouteError(f"block {first_map[0]} names wall sets {wall_sets}; start wall set is not unique")
    wall_set = wall_sets[0]
    if wall_set not in walldef or wall_set not in d8x8:
        raise RouteError(f"start wall set {wall_set} is not in both WALLDEF1.DAX and 8X8D1.DAX")

    demo = boot["demo_block"]
    demo_map = next((a[0][1] for _, a in flows[demo]["load_files"] if a[0][0] == 0 and a[0][1] not in NO_MAP), None)

    # Population statistics (measured over all of ECL1, the discriminating numbers).
    lf = [(b, args[0][1]) for b, f in flows.items() for _, args in f["load_files"] if args[0][0] == 0 and args[0][1] not in NO_MAP]
    lp = [(b, args[0][1]) for b, f in flows.items() for _, args in f["load_pieces"] if args[0][0] == 0 and args[0][1] not in NO_MAP]
    stats = {
        "ecl_blocks": len(ecl),
        "geo_blocks": len(geo),
        "walldef_blocks": len(walldef),
        "load_files_sites": len(lf),
        "load_files_in_geo1": sum(1 for _, g in lf if g in geo),
        "load_files_self_referential": sum(1 for b, g in lf if b == g),
        "load_pieces_sites": len(lp),
        "load_pieces_in_walldef1": sum(1 for _, w in lp if w in walldef),
        "self_id_guard_blocks": sum(1 for b, r in ecl.items() if self_id_guard(r, b)),
        "truncated_by_block": {b: f["truncated"] for b, f in sorted(flows.items()) if f["truncated"]},
        "boot_pair_in_ecl1_chance": round((len(ecl) / 256) ** 2, 4),
        "geo1_membership_chance": round(len(geo) / 256, 4),
        "walldef1_membership_chance": round(len(walldef) / 256, 4),
        "loose_pair_sites": loose_pair_sites(ovr),
    }
    return {
        "boot": boot,
        "archives": {"ecl": "ECL1.DAX", "geo": "GEO1.DAX", "walldef": "WALLDEF1.DAX", "walls_8x8": "8X8D1.DAX",
                     "game_area": 1, **{k: v for k, v in naming.items() if k in ("area_var_ds", "literal_offsets", "stores_of_1", "transient6_sites")}},
        "new_game_chain": order,
        "chain_edges": edges,
        "chain_first_instruction": {b: flows[b]["first"] for b in order},
        "start_map": {"loading_block": first_map[0], "load_files_vaddr": first_map[1],
                      "geo_block": map_block, "wall_set": wall_set,
                      "all_chain_geo_ids": sorted({w for b in order for _, a in flows[b]["load_files"] for w in [a[0][1]] if a[0][0] == 0 and w not in NO_MAP})},
        "demo": {"block": demo, "geo_block": demo_map},
        "block16": {"instructions": flows[boot["new_game_block"]]["instructions"],
                    "truncated": flows[boot["new_game_block"]]["truncated"],
                    "area_writes": flows[boot["new_game_block"]]["area"]},
        "native_smoke_block_34_on_chain": 34 in order,
        "stats": stats,
    }


def derive_from_dir(matrix_dir: Path) -> dict[str, Any]:
    files = load_files(matrix_dir)
    return derive_route(files["GAME.OVR"], read_dax(files["ECL1.DAX"]), read_dax(files["GEO1.DAX"]),
                        read_dax(files["WALLDEF1.DAX"]), read_dax(files["8X8D1.DAX"]))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dir", type=Path, default=None)
    args = ap.parse_args()
    d = args.dir or find_matrix_dir()
    if d is None:
        print("SKIP: Matrix Cubed extraction not found (GB_MATRIX_DIR / matrixcubed_extracted)", file=sys.stderr)
        return 0
    print(json.dumps(derive_from_dir(d), indent=1, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
