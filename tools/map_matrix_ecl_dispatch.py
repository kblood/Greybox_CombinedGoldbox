"""Map Buck Rogers: Matrix Cubed's ECL dispatcher, operand parser, and per-opcode operand word
sets from its own real `GAME.OVR` bytes -- then compare the result, opcode by opcode, against
Countdown to Doomsday's own measured dialect.

Matrix Cubed's `GAME.OVR` carries the `FBOV` magic (CoAB's own overlay-manager magic word), NOT
`TPOV` like Countdown to Doomsday's -- confirmed directly at offset 0
(`docs/engine/research/matrix-cubed-profile.md` §2). Because `FBOV` is the SAME magic CoAB, Pool
of Radiance and Death Knights of Krynn all carry, this tool needs none of the TPOV-specific
plumbing `tools/map_buck_ecl_dispatch.py` built for Countdown -- it is the plain
`tools/map_pool_ecl_dispatch.py` structural-match pipeline (`disassemble_shape`, `dispatch_table`,
`nearest_function`, `oracle_offset`), pointed at Matrix Cubed's own bytes, plus the same
prefetch-derived per-opcode operand-count extraction Buck's tool introduced
(`resolve_fallthrough_dispatch`, `derive_operand_parser_call_target`, `operand_word_sets`,
`stop_reasons` -- imported read-only from `tools/map_buck_ecl_dispatch.py`; R1 owns that file
concurrently this round and may change its contents, but these four functions are generic
structural-disassembly helpers with no TPOV/Buck-specific logic, so importing them is the
documented default in `docs/engine/PLAN-ROUND-31.md`'s R2 brief. Nothing in this module edits
`map_buck_ecl_dispatch.py` or `map_pool_ecl_dispatch.py`).

Two-sided by construction, same as Buck's own tool: `build_report` never invents a word set.
Opcodes whose handler does not call the derived operand-parser target before its first
`ret`/`retf`/`iret` are reported as `measured_word_set: null`.

Also two-sided on the magic itself: `read_matrix_bytes` refuses (raises `ValueError`) if the file
at the given path does not open with `FBOV` -- so accidentally pointing this tool at Countdown's
own `TPOV` `GAME.OVR` (or any other non-FBOV file) is a loud failure, not a silently wrong map.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import goldbox_corpus
import map_buck_ecl_dispatch
from map_buck_ecl_dispatch import (
    derive_operand_parser_call_target,
    operand_word_sets,
    resolve_fallthrough_dispatch,
    stop_reasons,
)
from map_pool_ecl_dispatch import (
    FunctionShape,
    dispatch_table,
    disassemble_shape,
    nearest_function,
    oracle_offset,
)

DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/matrix-ecl-dispatch-map.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/matrix-ecl-dispatch-map.md"

# Same path convention `tools/test_matrix_cubed_inventory.py` and
# `docs/engine/research/matrix-cubed-profile.md` use: the git-ignored extraction root
# (`*_extracted/` per `.gitignore:5`), never vendored, never written to.
EXTRACT_ROOT = goldbox_corpus.REPO_ROOT / "matrixcubed_extracted"
MATRIX_DIR = EXTRACT_ROOT / "BuckRogers2" / "c" / "Matrix"
DEFAULT_MATRIX_GAME_OVR = MATRIX_DIR / "GAME.OVR"

EXPECTED_MAGIC = b"FBOV"

# Buck's own eleven `0x41..0x4c` extension opcodes shipped with `uncertain: true`
# (`packages/engine/src/ecl/disassemble.ts`'s `ECL_GEN1_BUCK.opcodeOverrides`, mirrored as
# `EXTENSION_OPCODES` in `packages/engine/test/buckEclDialect.test.ts`). `0x42` is excluded on
# purpose: Buck's own dialect carries NO override for it at all (both titles' handlers call an
# unidentified far routine and never reach the derived operand-parser target), so it is not one of
# the eleven "uncertain" opcodes this brief cross-checks.
EXTENSION_OPCODES: list[int] = [0x41, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x4C]


def matrix_game_ovr_path() -> Path:
    return DEFAULT_MATRIX_GAME_OVR


def coab_game_ovr_path() -> Path:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(
        inventory, "curse-of-the-azure-bonds", routes.get("curse-of-the-azure-bonds")
    )
    if install is None:
        raise FileNotFoundError("install not found: curse-of-the-azure-bonds")
    files = goldbox_corpus.file_index(install)
    return files["GAME.OVR"]


def read_matrix_bytes(path: Path) -> bytes:
    """Read `path` and refuse (loudly) anything that does not open with `FBOV`.

    This is the tool's own null for "feed it the wrong title's overlay": Countdown to Doomsday's
    own `GAME.OVR` carries `TPOV` at the same offset (`tools/gen1_map.py`,
    `docs/engine/research/buck-ecl-dispatch-map.md`), so pointing this tool at it must not silently
    produce a map -- it must say exactly why it refused.
    """
    data = path.read_bytes()
    magic = data[:4]
    if magic != EXPECTED_MAGIC:
        raise ValueError(
            f"{path}: expected {EXPECTED_MAGIC!r} overlay magic (Matrix Cubed's own), got {magic!r} -- "
            "this tool is calibrated for Matrix Cubed's FBOV geometry only. A TPOV file (e.g. "
            "Countdown to Doomsday's own GAME.OVR) needs tools/map_buck_ecl_dispatch.py instead."
        )
    return data


def compare_to_buck(
    matrix_data: bytes,
    matrix_rows: list[dict[str, int]],
    matrix_measured: dict[int, int | None],
    buck_report: dict[str, Any],
) -> dict[str, Any]:
    """The sibling comparison the brief asks for: Matrix Cubed's own measured word sets against
    Countdown to Doomsday's own measured word sets (`tools/map_buck_ecl_dispatch.py`'s
    `build_report()`, re-run fresh here rather than reading a possibly-stale generated JSON, so this
    always compares against R1's current numbers), opcode by opcode, plus the eleven `0x41..0x4c`
    extension-opcode handler-body-similarity/prefetch-agreement table.
    """
    buck_bytes = Path(buck_report["buck_path"]).read_bytes()
    buck_rows_by_opcode = {row["opcode"]: row for row in buck_report["buck_dispatch"]}
    buck_measured: dict[int, int | None] = {int(k): v for k, v in buck_report["word_sets"].items()}
    matrix_rows_by_opcode = {row["opcode"]: row for row in matrix_rows}

    shared_opcodes = sorted(set(matrix_rows_by_opcode) & set(buck_rows_by_opcode))
    agree: list[dict[str, Any]] = []
    disagree: list[dict[str, Any]] = []
    both_unmeasured: list[int] = []
    one_sided_unmeasured: list[dict[str, Any]] = []
    for opcode in shared_opcodes:
        mv = matrix_measured.get(opcode)
        bv = buck_measured.get(opcode)
        if mv is None and bv is None:
            both_unmeasured.append(opcode)
            continue
        if mv is None or bv is None:
            one_sided_unmeasured.append({"opcode": opcode, "matrix_word_set": mv, "buck_word_set": bv})
            continue
        row = {"opcode": opcode, "matrix_word_set": mv, "buck_word_set": bv}
        (agree if mv == bv else disagree).append(row)

    matrix_only = sorted(set(matrix_rows_by_opcode) - set(buck_rows_by_opcode))
    buck_only = sorted(set(buck_rows_by_opcode) - set(matrix_rows_by_opcode))

    extension_table: list[dict[str, Any]] = []
    for opcode in EXTENSION_OPCODES:
        matrix_row = matrix_rows_by_opcode.get(opcode)
        buck_row = buck_rows_by_opcode.get(opcode)
        mv = matrix_measured.get(opcode) if matrix_row is not None else None
        bv = buck_measured.get(opcode) if buck_row is not None else None
        similarity: float | None = None
        trigram: float | None = None
        if matrix_row is not None and buck_row is not None:
            matrix_shape = disassemble_shape(matrix_data, matrix_row["handler_file_offset"])
            buck_shape = disassemble_shape(buck_bytes, buck_row["handler_file_offset"])
            if matrix_shape is not None and buck_shape is not None:
                similarity = SequenceMatcher(
                    None, buck_shape.tokens, matrix_shape.tokens, autojunk=False
                ).ratio()
                buck_grams = set(zip(buck_shape.tokens, buck_shape.tokens[1:], buck_shape.tokens[2:]))
                matrix_grams = set(
                    zip(matrix_shape.tokens, matrix_shape.tokens[1:], matrix_shape.tokens[2:])
                )
                trigram = len(buck_grams & matrix_grams) / max(1, len(buck_grams | matrix_grams))
        if matrix_row is None:
            verdict = "absent_in_matrix"
        elif mv is None and bv is None:
            verdict = "agree (both unmeasured -- no_far_call in both, per stop_reasons)"
        elif mv == bv:
            verdict = "agree"
        else:
            verdict = "disagree"
        extension_table.append(
            {
                "opcode": opcode,
                "matrix_handler_file_offset": matrix_row["handler_file_offset"] if matrix_row else None,
                "buck_handler_file_offset": buck_row["handler_file_offset"] if buck_row else None,
                "matrix_word_set": mv,
                "buck_word_set": bv,
                "handler_sequence_similarity": similarity,
                "handler_trigram_jaccard": trigram,
                "verdict": verdict,
            }
        )

    return {
        "shared_opcode_count": len(shared_opcodes),
        "agree": agree,
        "disagree": disagree,
        "both_unmeasured": both_unmeasured,
        "one_sided_unmeasured": one_sided_unmeasured,
        "matrix_opcodes_not_in_buck_table": matrix_only,
        "buck_opcodes_not_in_matrix_table": buck_only,
        "extension_opcode_table": extension_table,
    }


def build_report(
    oracle_path: Path = DEFAULT_ORACLE,
    matrix_path: Path | None = None,
    buck_report: dict[str, Any] | None = None,
    use_resident_image: bool = True,
) -> dict[str, Any]:
    """`use_resident_image` (round 32 R5, default True): unpack Matrix Cubed's own `START.EXE`
    with `tools/exepack_unpack.py` and run `map_buck_ecl_dispatch.walk_vacuous_opcodes` against
    it -- the SAME generalised resident-aware walk Buck's own `build_report` now runs, applied
    here to a DIFFERENT binary (different structural-match run, different oracle-relative
    offsets, different PC global address) as an independent replication, not a copy of Buck's
    numbers. See docs/engine/research/matrix-ecl-dialect.md's round 32 R5 section."""
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    matrix_path = matrix_path or matrix_game_ovr_path()
    coab_path = coab_game_ovr_path()
    matrix = read_matrix_bytes(matrix_path)
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
        candidate, ratio, jaccard = nearest_function(matrix, reference)
        matches[name] = {
            "coab": asdict(reference),
            "matrix": asdict(candidate),
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
        }
    dispatcher = FunctionShape(**matches["dispatcher"]["matrix"])
    linear_rows = dispatch_table(matrix, dispatcher)
    linear_opcodes = {row["opcode"] for row in linear_rows}
    linear_missing = {
        value for value in range(min(linear_opcodes), max(linear_opcodes) + 1) if value not in linear_opcodes
    }
    fallthrough = resolve_fallthrough_dispatch(matrix, dispatcher, linear_missing)
    for row in linear_rows:
        row["source"] = "linear"
    rows = linear_rows + [
        {"opcode": opcode, "handler_file_offset": handler, "source": "fallthrough-merge"}
        for opcode, handler in sorted(fallthrough.items())
    ]
    rows.sort(key=lambda row: row["opcode"])
    opcodes = [row["opcode"] for row in rows]
    matrix_missing = [value for value in range(min(opcodes), max(opcodes) + 1) if value not in opcodes]

    # Same two-pass method (linear scan, then fallthrough-merge resolution) applied to CoAB's own
    # commandTable, so the missing-opcode-signature comparison stays apples-to-apples -- mirrors
    # `map_buck_ecl_dispatch.build_report`'s identical treatment of CoAB.
    coab_dispatcher = FunctionShape(**matches["dispatcher"]["coab"])
    coab_linear_rows = dispatch_table(coab, coab_dispatcher)
    coab_linear_opcodes = {row["opcode"] for row in coab_linear_rows}
    coab_linear_missing = {
        value
        for value in range(min(coab_linear_opcodes), max(coab_linear_opcodes) + 1)
        if value not in coab_linear_opcodes
    }
    coab_fallthrough = resolve_fallthrough_dispatch(coab, coab_dispatcher, coab_linear_missing)
    coab_opcodes = coab_linear_opcodes | set(coab_fallthrough)
    coab_missing = sorted(
        value for value in range(min(coab_opcodes), max(coab_opcodes) + 1) if value not in coab_opcodes
    )
    shared_missing_within_040 = sorted(set(coab_missing) & set(v for v in matrix_missing if v <= 0x40))

    call_target, call_target_first_count, handler_count = derive_operand_parser_call_target(matrix, rows)
    measured = operand_word_sets(matrix, rows, call_target)
    reasons = stop_reasons(matrix, rows, measured, call_target)

    if buck_report is None:
        buck_report = map_buck_ecl_dispatch.build_report(oracle_path)
    sibling = compare_to_buck(matrix, rows, measured, buck_report)

    vacuous_opcode_walk: dict[str, Any] = {}
    resident_image_dest_len_bytes: int | None = None
    if use_resident_image:
        import exepack_unpack
        import gen1_map
        import vroomm_layout

        loader_dir = matrix_path.parent
        loader_path = loader_dir / ("START.EXE" if (loader_dir / "START.EXE").exists() else "GAME.EXE")
        resident_image, unpack_result = exepack_unpack.unpack(loader_path)
        resident_image_dest_len_bytes = unpack_result.dest_len_bytes

        pc_candidates = map_buck_ecl_dispatch.find_operand_parser_pc_global(
            matrix, matches["operand_parser"]["matrix"]["offset"]
        )
        if len(pc_candidates) == 1:
            loader_bytes = loader_path.read_bytes()
            overlay_bytes = matrix_path.read_bytes()
            descriptors = gen1_map.scan_descriptors(loader_bytes, overlay_bytes)
            layouts = vroomm_layout.descriptor_layouts(loader_bytes, overlay_bytes, descriptors)
            mz = gen1_map.parse_mz(loader_bytes)
            vroomm_layout.classify_lcall_routes(loader_bytes, overlay_bytes, mz, layouts)
            resolved_pairs: dict[tuple[int, int], Any] = {}
            for row in layouts:
                for entry in row.fixup_entries:
                    if entry.context != "lcall_segment" or entry.call_target_offset is None:
                        continue
                    rkey = (entry.original_segment, entry.call_target_offset)
                    existing = resolved_pairs.get(rkey)
                    if existing is None or (entry.route_kind == "public_stub_owned" and existing.route_kind != "public_stub_owned"):
                        resolved_pairs[rkey] = entry
            # Matrix's own operand-parser far-call pair, derived structurally from Matrix's own
            # handlers (NOT Buck's `0xb8, 0x2a` -- a different binary, a different pair).
            parser_pair_str = call_target
            seg_s, off_s = parser_pair_str.split(", ")
            parser_pair = (int(seg_s, 16), int(off_s, 16))
            vacuous_opcode_walk = map_buck_ecl_dispatch.walk_vacuous_opcodes(
                matrix, layouts, resolved_pairs, {str(o): v for o, v in reasons.items()},
                measured, parser_pair, pc_candidates[0], resident_image,
            )

    return {
        "schema_version": 1,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "matrix_path": goldbox_corpus.slash(matrix_path),
        "coab_path": goldbox_corpus.slash(coab_path),
        "buck_path": buck_report["buck_path"],
        "matrix_magic": EXPECTED_MAGIC.decode("ascii"),
        "matches": matches,
        "matrix_dispatch": rows,
        "matrix_opcodes": opcodes,
        "matrix_opcode_min": min(opcodes),
        "matrix_opcode_max": max(opcodes),
        "matrix_handler_count": len(rows),
        "matrix_fallthrough_resolved_count": len(fallthrough),
        "missing_within_range": matrix_missing,
        "coab_opcode_max": max(coab_opcodes),
        "coab_missing_within_range": coab_missing,
        "shared_missing_signature_within_0x40": shared_missing_within_040,
        "operand_parser_call_target": {
            "target": call_target,
            "handlers_using_it_first": call_target_first_count,
            "handlers_total": handler_count,
        },
        "word_sets": {str(opcode): value for opcode, value in measured.items()},
        "stop_reasons": {str(opcode): info for opcode, info in reasons.items()},
        "sibling_comparison_vs_buck": sibling,
        "resident_image_used": use_resident_image,
        "resident_image_dest_len_bytes": resident_image_dest_len_bytes,
        "vacuous_opcode_walk": vacuous_opcode_walk,
        "claim_boundary": (
            "Dispatcher/operand-parser ROLES are established by same-subsystem structural identity "
            "against the CoAB oracle, measured directly on Matrix Cubed's own real GAME.OVR bytes "
            "(FBOV overlay, confirmed at offset 0 -- refused if not). Per-opcode word sets are "
            "measured from each handler's own operand-parser prefetch call (mov al,N; push ax; "
            "lcall <derived target>), not inferred from Countdown's dialect, from corpus statistics, "
            "or assumed because the two titles share an engine generation. The sibling comparison "
            "against Countdown to Doomsday's own measured dialect is a SEPARATE, independently "
            "derived measurement on a SEPARATE binary; agreement is evidence, not an assumption this "
            "tool bakes in. Opcodes above the CoAB oracle's own 0x00-0x40 range are extensions with "
            "no oracle counterpart; their measured word sets are reported but their MNEMONICS/"
            "semantics are not claimed beyond what Countdown's own dialect already names them."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    dispatcher = report["matches"]["dispatcher"]
    parser = report["matches"]["operand_parser"]
    sibling = report["sibling_comparison_vs_buck"]
    lines = [
        "# Buck Rogers: Matrix Cubed ECL Dispatcher Map",
        "",
        "> Generated by `tools/map_matrix_ecl_dispatch.py`. Do not edit by hand.",
        "",
        f"- Matrix Cubed `GAME.OVR` magic: `{report['matrix_magic']}` (confirmed, not `TPOV`).",
        f"- Matrix dispatcher: `GAME.OVR:0x{dispatcher['matrix']['offset']:x}` ({dispatcher['matrix']['instruction_count']} instructions).",
        f"- CoAB oracle dispatcher: `GAME.OVR:0x{dispatcher['coab']['offset']:x}` ({dispatcher['coab']['instruction_count']} instructions).",
        f"- Dispatcher sequence similarity: `{dispatcher['sequence_similarity']:.4f}`; trigram Jaccard: `{dispatcher['trigram_jaccard']:.4f}` "
        "(Buck's own: `0.8872` / `0.4615`).",
        f"- Matrix operand parser: `GAME.OVR:0x{parser['matrix']['offset']:x}`; CoAB oracle: `0x{parser['coab']['offset']:x}`.",
        f"- Operand-parser sequence similarity: `{parser['sequence_similarity']:.4f}`; trigram Jaccard: `{parser['trigram_jaccard']:.4f}` "
        "(Buck's own: `0.8550` / `0.8276`).",
        f"- Matrix dispatches `{report['matrix_handler_count']}` opcodes from `0x{report['matrix_opcode_min']:02x}` "
        f"through `0x{report['matrix_opcode_max']:02x}` (CoAB's own table tops out at `0x{report['coab_opcode_max']:02x}`); "
        f"missing in range: `{[hex(v) for v in report['missing_within_range']]}`.",
        f"- Of those, `{report['matrix_fallthrough_resolved_count']}` were recovered by the same "
        "`cmp al,N; je/jne` fallthrough-merge resolver Buck's own tool uses.",
        f"- CoAB's own missing set (same two-pass method): `{[hex(v) for v in report['coab_missing_within_range']]}`.",
        f"- Shared missing-opcode signature within 0x00-0x40: `{len(report['shared_missing_signature_within_0x40'])}` "
        f"of `{len(report['coab_missing_within_range'])}` CoAB gaps also missing from Matrix's own table.",
        f"- Operand-parser call target (derived from Matrix's own handlers, not hard-coded): `{report['operand_parser_call_target']['target']}`, "
        f"the FIRST far call in {report['operand_parser_call_target']['handlers_using_it_first']}/"
        f"{report['operand_parser_call_target']['handlers_total']} dispatched handlers.",
        "",
        "## Sibling comparison against Countdown to Doomsday's own measured dialect",
        "",
        f"- Opcodes both titles dispatch: **{sibling['shared_opcode_count']}**.",
        f"- Agree (both measured, same word set): **{len(sibling['agree'])}**.",
        f"- Disagree (both measured, different word set): **{len(sibling['disagree'])}**.",
        f"- Both unmeasured (neither handler reaches its own derived call target): **{len(sibling['both_unmeasured'])}**.",
        f"- One-sided unmeasured (measured on one title, not the other): **{len(sibling['one_sided_unmeasured'])}**.",
        f"- Opcodes Matrix dispatches that Buck's own table does not: `{[hex(v) for v in sibling['matrix_opcodes_not_in_buck_table']]}`.",
        f"- Opcodes Buck dispatches that Matrix's own table does not: `{[hex(v) for v in sibling['buck_opcodes_not_in_matrix_table']]}`.",
        "",
        "### Opcodes where Matrix's own measured word set differs from Countdown's own",
        "",
        "| Opcode | Matrix | Buck |",
        "| ---: | ---: | ---: |",
        *[f"| `0x{row['opcode']:02x}` | `{row['matrix_word_set']}` | `{row['buck_word_set']}` |" for row in sibling["disagree"]],
        "",
        "## The eleven `0x41..0x4c` extension opcodes (Countdown ships all with `uncertain: true`)",
        "",
        "| Opcode | Matrix offset | Buck offset | Matrix word set | Buck word set | Handler sequence similarity | Handler trigram Jaccard | Verdict |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        *[
            f"| `0x{row['opcode']:02x}` | "
            + (f"`0x{row['matrix_handler_file_offset']:x}`" if row["matrix_handler_file_offset"] is not None else "(absent)")
            + " | "
            + (f"`0x{row['buck_handler_file_offset']:x}`" if row["buck_handler_file_offset"] is not None else "(absent)")
            + f" | `{row['matrix_word_set']}` | `{row['buck_word_set']}` | "
            + (f"`{row['handler_sequence_similarity']:.4f}`" if row["handler_sequence_similarity"] is not None else "n/a")
            + " | "
            + (f"`{row['handler_trigram_jaccard']:.4f}`" if row["handler_trigram_jaccard"] is not None else "n/a")
            + f" | {row['verdict']} |"
            for row in sibling["extension_opcode_table"]
        ],
        "",
        "## Opcode Handlers",
        "",
        "| Opcode | Matrix handler file offset | Measured word set | Source | Stop reason (if unmeasured) |",
        "| ---: | ---: | ---: | --- | --- |",
        *[
            f"| `0x{row['opcode']:02x}` | `0x{row['handler_file_offset']:x}` | `{report['word_sets'][str(row['opcode'])]}` | {row['source']} | "
            + (
                (
                    lambda info: f"{info['reason']}"
                    + (f" ({', '.join(info['far_call_targets'])})" if info["far_call_targets"] else "")
                )(report["stop_reasons"][str(row["opcode"])])
                if str(row["opcode"]) in report.get("stop_reasons", {})
                else ""
            )
            + " |"
            for row in report["matrix_dispatch"]
        ],
        "",
        "## Vacuous-opcode resident walk (round 32 R5)",
        "",
        f"`resident_image_used`: `{report.get('resident_image_used')}` "
        f"(`{report.get('resident_image_dest_len_bytes')}`-byte decompressed `START.EXE` load "
        "image, `tools/exepack_unpack.py`). The SAME generalised walk Buck's own tool runs "
        "(`map_buck_ecl_dispatch.walk_vacuous_opcodes`), applied here to Matrix Cubed's own "
        "different binary (own PC global, own operand-parser pair) as an independent "
        "replication -- see `docs/engine/research/matrix-ecl-dialect.md`'s round 32 R5 section "
        "for the opcode-by-opcode agreement against Buck's own result.",
        "",
        "| Opcode | Verdict |",
        "| ---: | --- |",
        *[
            f"| `{opcode}` | {info['verdict']} |"
            for opcode, info in sorted(report.get("vacuous_opcode_walk", {}).items())
        ],
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--matrix-ovr", type=Path, default=None)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.oracle, matrix_path=args.matrix_ovr)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        weak = [name for name, row in report["matches"].items() if row["sequence_similarity"] < 0.8]
        if weak:
            raise SystemExit(f"strict failure: weak Matrix ECL mapping {weak}")
    sibling = report["sibling_comparison_vs_buck"]
    print(
        f"matrix ecl map: dispatcher 0x{report['matches']['dispatcher']['matrix']['offset']:x} "
        f"({report['matches']['dispatcher']['sequence_similarity']:.3f}), "
        f"parser 0x{report['matches']['operand_parser']['matrix']['offset']:x} "
        f"({report['matches']['operand_parser']['sequence_similarity']:.3f}), "
        f"sibling: {len(sibling['agree'])} agree / {len(sibling['disagree'])} disagree / "
        f"{len(sibling['both_unmeasured'])} both-unmeasured of {sibling['shared_opcode_count']} shared"
    )


if __name__ == "__main__":
    main()
