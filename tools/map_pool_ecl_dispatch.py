"""Map Pool of Radiance's ECL dispatcher and operand parser from retail code shape."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import goldbox_corpus


DEFAULT_ORACLE = goldbox_corpus.REPO_ROOT / "build/coab-oracle-map.json"
DEFAULT_CALLS = goldbox_corpus.REPO_ROOT / "build/vroomm-call-correlations.json"
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/pool-ecl-dispatch-map.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/pool-ecl-dispatch-map.md"


@dataclass(frozen=True)
class FunctionShape:
    offset: int
    size: int
    instruction_count: int
    tokens: tuple[str, ...]


def disassemble_shape(data: bytes, offset: int, max_size: int = 1024) -> FunctionShape | None:
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    tokens: list[str] = []
    end = 0
    for ins in md.disasm(data[offset:offset + max_size], offset):
        operands: list[str] = []
        for operand in ins.operands:
            if operand.type == capstone.x86.X86_OP_REG:
                operands.append("reg")
            elif operand.type == capstone.x86.X86_OP_IMM:
                operands.append("imm")
            elif operand.type == capstone.x86.X86_OP_MEM:
                operands.append("mem")
            else:
                operands.append("other")
        tokens.append(f"{ins.mnemonic.lower()}({','.join(operands)})")
        end = ins.address + ins.size - offset
        if ins.mnemonic.lower() in {"ret", "retf", "iret"}:
            break
    if len(tokens) < 3 or not tokens[-1].startswith(("ret(", "retf(", "iret(")):
        return None
    return FunctionShape(offset, end, len(tokens), tuple(tokens))


def nearest_function(data: bytes, reference: FunctionShape) -> tuple[FunctionShape, float, float]:
    starts = sorted({
        offset
        for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
        for offset in range(len(data))
        if data.startswith(pattern, offset)
    })
    ref_grams = set(zip(reference.tokens, reference.tokens[1:], reference.tokens[2:]))
    ranked: list[tuple[float, float, FunctionShape]] = []
    for start in starts:
        candidate = disassemble_shape(data, start)
        if candidate is None:
            continue
        ratio = SequenceMatcher(None, reference.tokens, candidate.tokens, autojunk=False).ratio()
        grams = set(zip(candidate.tokens, candidate.tokens[1:], candidate.tokens[2:]))
        jaccard = len(ref_grams & grams) / max(1, len(ref_grams | grams))
        ranked.append((ratio, jaccard, candidate))
    if not ranked:
        raise ValueError("no Pool function candidates")
    ratio, jaccard, candidate = max(ranked, key=lambda item: (item[0], item[1]))
    return candidate, ratio, jaccard


def dispatch_table(data: bytes, function: FunctionShape) -> list[dict[str, int]]:
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    current_opcode: int | None = None
    rows: list[dict[str, int]] = []
    for ins in md.disasm(data[function.offset:function.offset + function.size], function.offset):
        if ins.mnemonic == "cmp" and len(ins.operands) == 2:
            left, right = ins.operands
            if left.type == capstone.x86.X86_OP_REG and ins.reg_name(left.reg) == "al" and right.type == capstone.x86.X86_OP_IMM:
                current_opcode = right.imm & 0xFF
        elif ins.mnemonic == "call" and current_opcode is not None and ins.operands and ins.operands[0].type == capstone.x86.X86_OP_IMM:
            rows.append({"opcode": current_opcode, "handler_file_offset": ins.operands[0].imm})
            current_opcode = None
    unique: dict[int, dict[str, int]] = {}
    for row in rows:
        unique.setdefault(row["opcode"], row)
    return [unique[key] for key in sorted(unique)]


def oracle_offset(oracle: dict[str, Any], symbol: str) -> int:
    row = next((item for item in oracle["functions"] if item["symbol"] == symbol), None)
    if row is None:
        raise ValueError(f"CoAB oracle symbol not found: {symbol}")
    return int(row["retail_file_offset"])


def correlated_pool_target(
    oracle: dict[str, Any], calls: dict[str, Any], symbol: str
) -> tuple[int, dict[str, Any]]:
    """Resolve a CoAB oracle function to Pool through the generated body cluster.

    This is deliberately stricter than scanning for a similar-looking function: the oracle row
    must already carry an exact/relocation-normalized cluster, and the Pool target must be the
    public-stub-owned target emitted by the VROOMM correlation pipeline.
    """
    source = next((item for item in oracle["functions"] if item["symbol"] == symbol), None)
    if source is None or not source.get("cluster_hash"):
        raise ValueError(f"clustered CoAB oracle symbol not found: {symbol}")
    rows = [
        row
        for row in calls["correlations"]
        if row.get("cluster_hash") == source["cluster_hash"]
        and "pool-of-radiance" in row.get("caller_profiles", [])
        and row.get("route_kind") == "public_stub_owned"
    ]
    if len(rows) != 1:
        raise ValueError(f"expected one Pool correlation for {symbol}, got {len(rows)}")
    return int(rows[0]["target_offset"]), rows[0]


def extract_host_registers(data: bytes, function_offset: int, max_size: int = 512) -> dict[str, int]:
    """Extract Pool's special ECL host-register backing bytes from vm_GetMemoryValue.

    Pool handles virtual addresses C04B..C04F as a five-case switch. Each case loads one
    DS-relative byte: X, Y, direction, wall type, and the current GEO cell descriptor/roof byte.
    We recognize the switch from its own ``cmp [bp+6],0xc04b`` and ``sub ax,0xc04b`` guards, then
    collect only absolute DS byte loads under cases 0..4.
    """
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    in_special_switch = False
    current_case: int | None = None
    found: dict[int, int] = {}
    for ins in md.disasm(data[function_offset:function_offset + max_size], function_offset):
        if ins.mnemonic == "sub" and len(ins.operands) == 2:
            left, right = ins.operands
            if (
                left.type == capstone.x86.X86_OP_REG
                and ins.reg_name(left.reg) == "ax"
                and right.type == capstone.x86.X86_OP_IMM
                and (right.imm & 0xFFFF) == 0xC04B
            ):
                in_special_switch = True
                continue
        if not in_special_switch:
            continue
        if ins.mnemonic == "cmp" and len(ins.operands) == 2:
            left, right = ins.operands
            if (
                left.type == capstone.x86.X86_OP_REG
                and ins.reg_name(left.reg) == "ax"
                and right.type == capstone.x86.X86_OP_IMM
            ):
                value = right.imm & 0xFFFF
                current_case = value if value <= 4 else None
                continue
        if ins.mnemonic in {"ret", "retf"}:
            break
        if current_case is None or current_case in found or ins.mnemonic != "mov":
            continue
        for operand in ins.operands:
            if operand.type != capstone.x86.X86_OP_MEM:
                continue
            mem = operand.mem
            if mem.base == 0 and mem.index == 0:
                found[current_case] = mem.disp & 0xFFFF
                break
    if set(found) != set(range(5)):
        raise ValueError(f"incomplete Pool C04B..C04F host-register switch: {found}")
    return {f"0x{0xC04B + index:04X}": found[index] for index in range(5)}


def retail_files() -> tuple[Path, Path]:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    paths: dict[str, Path] = {}
    for profile_id in ("pool-of-radiance", "curse-of-the-azure-bonds"):
        profile = next(item for item in goldbox_corpus.PROFILES if item["id"] == profile_id)
        install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
        if install is None:
            raise FileNotFoundError(f"install not found: {profile_id}")
        files = goldbox_corpus.file_index(install)
        paths[profile_id] = files["GAME.OVR"]
    return paths["pool-of-radiance"], paths["curse-of-the-azure-bonds"]


def build_report(
    oracle_path: Path = DEFAULT_ORACLE,
    calls_path: Path = DEFAULT_CALLS,
) -> dict[str, Any]:
    oracle = json.loads(oracle_path.read_text(encoding="utf-8"))
    calls = json.loads(calls_path.read_text(encoding="utf-8"))
    pool_path, coab_path = retail_files()
    pool = pool_path.read_bytes()
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
        candidate, ratio, jaccard = nearest_function(pool, reference)
        matches[name] = {
            "coab": asdict(reference),
            "pool": asdict(candidate),
            "sequence_similarity": ratio,
            "trigram_jaccard": jaccard,
        }
    dispatcher = FunctionShape(**matches["dispatcher"]["pool"])
    rows = dispatch_table(pool, dispatcher)
    memory_get_offset, memory_get_correlation = correlated_pool_target(
        oracle, calls, "sub_30F16"
    )
    host_registers = extract_host_registers(pool, memory_get_offset)
    return {
        "schema_version": 1,
        "provenance": "same-subsystem-structural-map-verified-against-coab-oracle-and-retail-bytes",
        "pool_path": goldbox_corpus.slash(pool_path),
        "coab_path": goldbox_corpus.slash(coab_path),
        "matches": matches,
        "memory_get": {
            "coab_symbol": "sub_30F16",
            "pool_offset": memory_get_offset,
            "mapping_evidence": "relocation-normalized VROOMM public-stub-owned cluster",
            "cluster_hash": memory_get_correlation["cluster_hash"],
            "host_registers": host_registers,
            "roles": {
                "0xC04B": "mapPosX",
                "0xC04C": "mapPosY",
                "0xC04D": "mapDirection (stored cardinal value 0/2/4/6; ECL reads /2)",
                "0xC04E": "mapWallType",
                "0xC04F": "mapWallRoof/current GEO cell descriptor",
            },
        },
        "pool_dispatch": rows,
        "pool_opcodes": [row["opcode"] for row in rows],
        "pool_opcode_min": min(row["opcode"] for row in rows),
        "pool_opcode_max": max(row["opcode"] for row in rows),
        "missing_within_range": [value for value in range(min(row["opcode"] for row in rows), max(row["opcode"] for row in rows) + 1) if value not in {row["opcode"] for row in rows}],
        "claim_boundary": "Function roles are established by same-subsystem structural identity; handler semantics still require Pool behavior or runtime evidence.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    dispatcher = report["matches"]["dispatcher"]
    parser = report["matches"]["operand_parser"]
    opcodes = report["pool_opcodes"]
    return "\n".join([
        "# Pool of Radiance ECL Dispatcher Map",
        "",
        "> Generated by `tools/map_pool_ecl_dispatch.py`. Do not edit by hand.",
        "",
        f"- Pool dispatcher: `GAME.OVR:0x{dispatcher['pool']['offset']:x}` ({dispatcher['pool']['instruction_count']} instructions).",
        f"- CoAB oracle dispatcher: `GAME.OVR:0x{dispatcher['coab']['offset']:x}` ({dispatcher['coab']['instruction_count']} instructions).",
        f"- Dispatcher sequence similarity: `{dispatcher['sequence_similarity']:.4f}`; trigram Jaccard: `{dispatcher['trigram_jaccard']:.4f}`.",
        f"- Pool operand parser: `GAME.OVR:0x{parser['pool']['offset']:x}`; CoAB oracle: `0x{parser['coab']['offset']:x}`.",
        f"- Operand-parser sequence similarity: `{parser['sequence_similarity']:.4f}`; trigram Jaccard: `{parser['trigram_jaccard']:.4f}`.",
        f"- Pool dispatches `{len(opcodes)}` opcodes from `0x{report['pool_opcode_min']:02x}` through `0x{report['pool_opcode_max']:02x}`; missing in range: `{[hex(value) for value in report['missing_within_range']]}`.",
        f"- Pool memory getter: `GAME.OVR:0x{report['memory_get']['pool_offset']:x}` (`sub_30F16` relocation-normalized cluster).",
        "",
        "## Special Host Registers",
        "",
        "Pool's own retail getter subtracts `0xC04B` and dispatches cases 0..4 to direct",
        "DGROUP bytes. These are not fields in the current Area1 allocation.",
        "",
        "| ECL address | Pool DGROUP offset | Role |",
        "| ---: | ---: | --- |",
        *[
            f"| `{address}` | `0x{offset:04X}` | {report['memory_get']['roles'][address]} |"
            for address, offset in report["memory_get"]["host_registers"].items()
        ],
        "",
        "## Opcode Handlers",
        "",
        "| Opcode | Pool handler file offset |",
        "| ---: | ---: |",
        *[f"| `0x{row['opcode']:02x}` | `0x{row['handler_file_offset']:x}` |" for row in report["pool_dispatch"]],
        "",
        "## Claim Boundary",
        "",
        report["claim_boundary"],
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", type=Path, default=DEFAULT_ORACLE)
    parser.add_argument("--calls", type=Path, default=DEFAULT_CALLS)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.oracle, args.calls)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    if args.strict:
        failures = [name for name, row in report["matches"].items() if row["sequence_similarity"] < 0.95]
        expected_registers = {f"0x{address:04X}": 0x6AAD + index for index, address in enumerate(range(0xC04B, 0xC050))}
        if failures or report["pool_opcode_max"] != 0x3D or report["memory_get"]["host_registers"] != expected_registers:
            raise SystemExit(f"strict failure: weak Pool ECL mapping {failures} max={report['pool_opcode_max']:#x}")
    print(
        f"pool ecl map: dispatcher 0x{report['matches']['dispatcher']['pool']['offset']:x} "
        f"({report['matches']['dispatcher']['sequence_similarity']:.3f}), "
        f"parser 0x{report['matches']['operand_parser']['pool']['offset']:x} "
        f"({report['matches']['operand_parser']['sequence_similarity']:.3f})"
    )


if __name__ == "__main__":
    main()
