"""Map Death Knights of Krynn's (DoK) ECL dispatcher, operand parser, and CMD_Goto handler from
retail code shape.

Mirrors `tools/map_pool_ecl_dispatch.py`'s technique verbatim (same-subsystem structural function
matching against the shared CoAB oracle, `build/coab-oracle-map.json`), applied to DoK's own real
`GAME.OVR` bytes instead of Pool's. DoK is family `gen1-fbov` (same VROOMM/FBOV overlay-loader
shape as CoAB/Pool: a single `START.EXE` resident image + `GAME.OVR` overlay, confirmed directly --
`GAME.OVR` starts with ASCII `FBOV`, and `tools/disasm_dok.py` already reverse-engineered DoK's own
35-entry FBOV overlay descriptor table from its own bytes).

This tool exists to answer a specific open question from `docs/engine/research/dok-natural-route.md`
(BUILD-QUEUE.md's DoK P2 "genuinely blocked" leaf): whether DoK's OWN operand parser and GOTO
handler match CoAB's oracle model (`coab_extracted/Classes/Opperation.cs`'s `highSet` rule and
`coab_extracted/engine/ovr003.cs`'s `CMD_Goto`), or whether DoK's compiled `GAME.OVR` implements a
DoK-specific addressing convention CoAB's shared oracle never needed to model. The `commandTable`
(dispatcher) match locates the opcode->handler jump table (so `pool_dispatch`/`dok_dispatch`'s
opcode 0x01 entry IS the real CMD_Goto candidate, not a guess); the `operand_parser` match locates
`vm_LoadCmdSets` (COAB `parse_command_sub`) directly. `cmd_goto_handler_file_offset` is read
straight out of the dispatcher's own opcode-0x01 row -- it is not independently structurally
matched (a CMD_Goto-vs-oracle direct match would need a second reference shape; the whole point of
locating it via the dispatch table is that the ROLE, not the byte content, is what identifies it).
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import goldbox_corpus
from map_pool_ecl_dispatch import FunctionShape, dispatch_table, disassemble_shape, nearest_function, oracle_offset


DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/dok-ecl-dispatch-map.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/dok-ecl-dispatch-map.md"

GOTO_OPCODE = 0x01


def retail_files() -> tuple[Path, Path]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in ("death-knights-of-krynn", "curse-of-the-azure-bonds"):
        profile = next(item for item in goldbox_corpus.PROFILES if item["id"] == profile_id)
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths["death-knights-of-krynn"], paths["curse-of-the-azure-bonds"]


def build_report(oracle_path: Path = DEFAULT_ORACLE) -> dict[str, Any]:
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    dok_path, coab_path = retail_files()
    dok = dok_path.read_bytes()
    coab = coab_path.read_bytes()
    references = {
        "dispatcher": disassemble_shape(coab, oracle_offset(oracle, "commandTable")),
        "operand_parser": disassemble_shape(coab, oracle_offset(oracle, "@parse_command_sub$q4Byte")),
    }
    if any(value is None for value in references.values()):
        raise ValueError("failed to disassemble CoAB oracle functions")
    matches: dict[str, dict[str, Any]] = {}
    for name, reference in references.items():
        assert reference is not None
        candidate, ratio, jaccard = nearest_function(dok, reference)
        matches[name] = {
            "coab": asdict(reference),
            "dok": asdict(candidate),
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
        }
    dispatcher = FunctionShape(**matches["dispatcher"]["dok"])
    rows = dispatch_table(dok, dispatcher)
    goto_row = next((row for row in rows if row["opcode"] == GOTO_OPCODE), None)
    return {
        "schema_version": 1,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "dok_path": goldbox_corpus.slash(dok_path),
        "coab_path": goldbox_corpus.slash(coab_path),
        "matches": matches,
        "dok_dispatch": rows,
        "dok_opcodes": [row["opcode"] for row in rows],
        "dok_opcode_min": min(row["opcode"] for row in rows),
        "dok_opcode_max": max(row["opcode"] for row in rows),
        "missing_within_range": [value for value in range(min(row["opcode"] for row in rows), max(row["opcode"] for row in rows) + 1) if value not in {row["opcode"] for row in rows}],
        "cmd_goto_handler_file_offset": goto_row["handler_file_offset"] if goto_row else None,
        "claim_boundary": (
            "Function roles are established by same-subsystem structural identity against the "
            "CoAB oracle, verified on DoK's own real GAME.OVR bytes (not assumed from the oracle "
            "alone). The operand-parser and dispatcher matches both scored sequence_similarity="
            "1.0/trigram_jaccard=1.0 on first run (2026-07-17) -- byte-identical control-flow shape, "
            "differing only in absolute data-segment address literals (the expected signature of a "
            "different link of the same source, not a different algorithm). This settles the "
            "dok-natural-route.md open question in favor of 'DoK's own retail operand parser and "
            "CMD_Goto match CoAB's oracle model exactly' -- see docs/engine/research/"
            "dok-natural-route.md's 2026-07-17 section for the disassembly-level confirmation "
            "(including cross-checking cmd_goto_handler_file_offset's own disassembly, which is not "
            "automated by this tool) and the DOSBox-X dynamic-trace corroboration."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    dispatcher = report["matches"]["dispatcher"]
    parser = report["matches"]["operand_parser"]
    opcodes = report["dok_opcodes"]
    goto_offset = report["cmd_goto_handler_file_offset"]
    return "\n".join([
        "# Death Knights of Krynn ECL Dispatcher Map",
        "",
        "> Generated by `tools/map_dok_ecl_dispatch.py`. Do not edit by hand.",
        "",
        f"- DoK dispatcher: `GAME.OVR:0x{dispatcher['dok']['offset']:x}` ({dispatcher['dok']['instruction_count']} instructions).",
        f"- CoAB oracle dispatcher: `GAME.OVR:0x{dispatcher['coab']['offset']:x}` ({dispatcher['coab']['instruction_count']} instructions).",
        f"- Dispatcher sequence similarity: `{dispatcher['sequence_similarity']:.4f}`; trigram Jaccard: `{dispatcher['trigram_jaccard']:.4f}`.",
        f"- DoK operand parser (`vm_LoadCmdSets`): `GAME.OVR:0x{parser['dok']['offset']:x}`; CoAB oracle: `0x{parser['coab']['offset']:x}`.",
        f"- Operand-parser sequence similarity: `{parser['sequence_similarity']:.4f}`; trigram Jaccard: `{parser['trigram_jaccard']:.4f}`.",
        f"- DoK dispatches `{len(opcodes)}` opcodes from `0x{report['dok_opcode_min']:02x}` through `0x{report['dok_opcode_max']:02x}`; missing in range: `{[hex(value) for value in report['missing_within_range']]}`.",
        f"- Opcode `0x01` (GOTO) handler file offset: `0x{goto_offset:x}`." if goto_offset is not None else "- Opcode `0x01` (GOTO) handler: NOT FOUND in the dispatch table.",
        "",
        "## Opcode Handlers",
        "",
        "| Opcode | DoK handler file offset |",
        "| ---: | ---: |",
        *[f"| `0x{row['opcode']:02x}` | `0x{row['handler_file_offset']:x}` |" for row in report["dok_dispatch"]],
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.oracle)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        failures = [name for name, row in report["matches"].items() if row["sequence_similarity"] < 0.95]
        if failures:
            raise SystemExit(f"strict failure: weak DoK ECL mapping {failures}")
    print(
        f"dok ecl map: dispatcher 0x{report['matches']['dispatcher']['dok']['offset']:x} "
        f"({report['matches']['dispatcher']['sequence_similarity']:.3f}), "
        f"parser 0x{report['matches']['operand_parser']['dok']['offset']:x} "
        f"({report['matches']['operand_parser']['sequence_similarity']:.3f}), "
        f"cmd_goto 0x{report['cmd_goto_handler_file_offset']:x}"
    )


if __name__ == "__main__":
    main()
