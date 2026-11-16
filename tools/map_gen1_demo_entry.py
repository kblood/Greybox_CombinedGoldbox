#!/usr/bin/env python3
"""Locate any Gen1 Krynn-family title's own literal `inDemo`/new-game `EclBlockId`
constants and decode the resulting ECL script chain(s).

Generalizes `map_cok_demo_entry.py` (which itself ported the structural technique
`docs/engine/research/gateway-newgame-route.md` used for Gateway) to any profile
`goldbox_corpus.choose_install` can resolve an install for. Same method, no
DOSBox-X, no GameLink, no live trace -- pure static analysis:

1. Locate the title's own compiled counterpart of the CoAB oracle's `sub_29758`
   boot-dispatch function by control-flow *shape* match against CoAB's own
   compiled `GAME.OVR` bytes (`map_gateway_ecl_runtime_candidates.function_shapes`
   / `best_match`).
2. Disambiguate the two struct-copy target addresses with
   `map_cok_demo_entry.struct_field_confirmed_target` -- the address-content-free
   idiom match that works even when a title's literal EclBlockId constants don't
   value-match CoAB's own `(0x52, 1)` pair.
3. Once the literal EclBlockId constants are known, find which `ECL*.DAX` this
   title's own install ships each in, then decode the reachable script content via
   `map_cok_demo_entry.follow_chain` (already fully generic -- cross-file NEWECL
   chain walking, human-readable instruction + string rendering).

Run one profile at a time; each profile's own GAME.OVR (or GAME.EXE, for titles
whose front end ships the loader+overlay split differently) is disassembled fresh.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import goldbox_corpus
from gen1_ecl_encounter_scan import word_sets_for_profile
from map_cok_demo_entry import follow_chain, resolve_boot_dispatch, sha256
from map_gateway_ecl_runtime_candidates import DEFAULT_COAB

REPO_ROOT = goldbox_corpus.REPO_ROOT
# GB_ORACLE_MAP overrides the ignored oracle path (e.g. to simulate its absence).
DEFAULT_ORACLE = Path(os.environ.get("GB_ORACLE_MAP") or REPO_ROOT / "build" / "coab-oracle-map.json")


def build_report(profile_id: str, coab: Path = DEFAULT_COAB, oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    if install is None:
        raise FileNotFoundError(f"{profile_id}: install not detected")
    files = goldbox_corpus.file_index(install)
    if "GAME.OVR" not in files:
        raise FileNotFoundError(f"{profile_id}: no GAME.OVR in detected install {install.path}")

    game_overlay = files["GAME.OVR"].read_bytes()
    coab_overlay = (coab / "GAME.OVR").read_bytes()
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))

    dispatch = resolve_boot_dispatch(game_overlay, coab_overlay, oracle)

    demo_chain: list[dict[str, Any]] = []
    newgame_chain: list[dict[str, Any]] = []
    demo_block_known = False
    newgame_block_known = False
    demo_file = newgame_file = None
    if dispatch["resolved"]:
        demo_id = dispatch["cok_demo_ecl_block_id"]
        newgame_id = dispatch["cok_newgame_ecl_block_id"]
        block_locations: dict[int, str] = {}
        for name, path in sorted(files.items()):
            if not name.upper().startswith("ECL") or path.suffix.upper() != ".DAX":
                continue
            for block in goldbox_corpus.read_dax_blocks(path):
                block_locations.setdefault(block["block_id"], name)
        demo_file = block_locations.get(demo_id)
        newgame_file = block_locations.get(newgame_id)
        demo_block_known = demo_file is not None
        newgame_block_known = newgame_file is not None
        if demo_block_known:
            demo_chain = follow_chain(
                files,
                demo_file,
                demo_id,
                word_sets=word_sets_for_profile(profile_id),
            )
        if newgame_block_known:
            newgame_chain = follow_chain(
                files,
                newgame_file,
                newgame_id,
                word_sets=word_sets_for_profile(profile_id),
            )

    return {
        "schema_version": 1,
        "profile_id": profile_id,
        "install_path": str(install.path),
        "sources": {
            "game_overlay": {"path": str(files["GAME.OVR"]), "sha256": sha256(game_overlay)},
            "coab_overlay": {"path": str(coab / "GAME.OVR"), "sha256": sha256(coab_overlay)},
            "coab_oracle": str(oracle_path),
        },
        "boot_dispatch": dispatch,
        "demo_block_id": dispatch.get("cok_demo_ecl_block_id"),
        "newgame_block_id": dispatch.get("cok_newgame_ecl_block_id"),
        "demo_file": demo_file,
        "newgame_file": newgame_file,
        "demo_block_known": demo_block_known,
        "newgame_block_known": newgame_block_known,
        "demo_chain": demo_chain,
        "newgame_chain": newgame_chain,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True, help="profile id, e.g. death-knights-of-krynn")
    parser.add_argument("--coab", type=Path, default=DEFAULT_COAB)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args()
    report = build_report(args.profile, coab=args.coab, oracle_path=args.oracle)
    out = args.json or (REPO_ROOT / "build" / f"{args.profile}-demo-entry.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"profile={report['profile_id']} resolved={report['boot_dispatch']['resolved']} "
        f"ratio={report['boot_dispatch']['structural_match_ratio']:.4f} "
        f"demo_block={report['demo_block_id']} file={report['demo_file']} (known={report['demo_block_known']}) "
        f"newgame_block={report['newgame_block_id']} file={report['newgame_file']} (known={report['newgame_block_known']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
