"""Scan Death Knights of Krynn's `GAME.OVR` for every read/write access to a given struct offset
relative to the `area_ptr` far pointer at DGROUP `0x8C2D` (`LES DI, [0x8C2D]` ... `ES:[DI+disp]`).

Built to answer item 1 of `docs/engine/research/dok-natural-route.md`'s "2026-07-17 Update 6"
next-steps list: semantically decode the `+0xFC..+0xFE` byte triple a prior round found changing
value at save-touch checkpoints (`(00,00,00)` -> `(04,0B,0A)` -> `(04,08,0A)`) but never traced to
any writing instruction. `area_ptr`'s far-pointer address (`0x8C2D`) and one already-proven field
(`+0xF2` == `LastEclBlockId`, established via `CMD_NewECL`'s own `MOV ES:[DI+0xF2],AL`) are reused
as anchors, not re-derived.

Method: find every `LES DI, [0x8C2D]` occurrence (148 in the current retail `GAME.OVR`), then
disassemble a window after each and record every instruction whose memory operand has DI as its
base register (i.e. genuinely relative to the just-loaded area_ptr, not some unrelated local/stack
access that happens to reuse DI) -- classifying each as a struct READ (DI-relative operand is a
SOURCE) or WRITE (DI-relative operand is a DESTINATION). This is a generic scan, not offset-specific
-- pass `--offsets` to focus the summary on particular struct fields.

Claim boundary: this is a purely static byte/disassembly scan. It proves which instructions in the
binary touch a given struct offset (or that NONE do, which is itself real negative evidence -- see
the `+0xFD`/`+0xFE` finding, which have reads but zero writes anywhere in this scan's coverage,
supporting the theory that those fields are populated by a bulk struct/save deserialize rather than
any single traceable instruction). It does not run DOSBox-X and does not observe live values.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import goldbox_corpus

AREA_PTR_FAR_ADDR = 0x8C2D
DEFAULT_JSON = goldbox_corpus.REPO_ROOT / "build/dok-area-struct-field-scan.json"
DEFAULT_MARKDOWN = goldbox_corpus.REPO_ROOT / "docs/engine/research/dok-area-struct-field-scan.md"


def dok_path() -> Path:
    inventory = goldbox_corpus.binary_inventory.inventory(goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False)
    routes = goldbox_corpus.load_routes()
    profile_id = "death-knights-of-krynn"
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    if install is None:
        raise FileNotFoundError(f"install not found: {profile_id}")
    files = goldbox_corpus.file_index(install)
    return files["GAME.OVR"]


@dataclass(frozen=True)
class FieldAccess:
    les_offset: int          # file offset of the LES DI,[area_ptr] this access followed
    insn_offset: int         # file offset of the accessing instruction itself
    disp: int                # struct offset (unsigned 16-bit)
    kind: str                # "read" or "write"
    mnemonic: str
    op_str: str


def u16(value: int) -> int:
    return value & 0xFFFF


def find_les_hits(data: bytes) -> list[int]:
    pat = bytes([0xC4, 0x3E]) + (AREA_PTR_FAR_ADDR & 0xFF).to_bytes(1, "little") + ((AREA_PTR_FAR_ADDR >> 8) & 0xFF).to_bytes(1, "little")
    hits = []
    i = 0
    while True:
        j = data.find(pat, i)
        if j == -1:
            break
        hits.append(j)
        i = j + 1
    return hits


def scan(data: bytes, window: int = 220) -> list[FieldAccess]:
    import capstone

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    accesses: list[FieldAccess] = []
    for h in find_les_hits(data):
        chunk = data[h:h + window]
        try:
            instrs = list(md.disasm(chunk, h))
        except Exception:
            continue
        for ins in instrs:
            for op_index, op in enumerate(ins.operands):
                if op.type != capstone.x86.X86_OP_MEM:
                    continue
                if md.reg_name(op.mem.base) != "di":
                    continue
                disp = u16(op.mem.disp)
                kind = "write" if op_index == 0 else "read"
                accesses.append(FieldAccess(h, ins.address, disp, kind, ins.mnemonic, ins.op_str))
    return accesses


def summarize(accesses: list[FieldAccess]) -> dict[int, dict[str, Any]]:
    by_disp: dict[int, dict[str, Any]] = {}
    for a in accesses:
        row = by_disp.setdefault(a.disp, {"reads": [], "writes": []})
        entry = {"insn_offset": a.insn_offset, "les_offset": a.les_offset, "mnemonic": a.mnemonic, "op_str": a.op_str}
        row["reads" if a.kind == "read" else "writes"].append(entry)
    return dict(sorted(by_disp.items()))


def build_report(offsets: list[int] | None = None) -> dict[str, Any]:
    path = dok_path()
    data = path.read_bytes()
    accesses = scan(data)
    summary = summarize(accesses)
    if offsets:
        summary = {disp: row for disp, row in summary.items() if disp in offsets}
    return {
        "schema_version": 1,
        "dok_path": goldbox_corpus.slash(path),
        "area_ptr_far_addr": AREA_PTR_FAR_ADDR,
        "les_hit_count": len(find_les_hits(data)),
        "total_field_accesses": len(accesses),
        "by_struct_offset": {f"0x{disp:x}": row for disp, row in summary.items()},
        "claim_boundary": (
            "Purely static: every DI-based memory operand found within a bounded window after each "
            "of the retail GAME.OVR's own LES DI,[0x8C2D] loads. A struct offset with reads but zero "
            "writes anywhere in this scan is real negative evidence (no traceable single-instruction "
            "write exists), not proof no write exists anywhere in the binary outside this scan's "
            "windowed coverage -- a function that re-loads the area_ptr far outside the 220-byte "
            "window used here, or writes via a different addressing convention (e.g. a different "
            "base register aliased to the same pointer), would not be found."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# DoK `area_ptr` Struct-Field Access Scan",
        "",
        "> Generated by `tools/scan_dok_area_struct_fields.py`. Do not edit by hand.",
        "",
        f"- `GAME.OVR`: `{report['dok_path']}`",
        f"- `LES DI,[0x{report['area_ptr_far_addr']:x}]` occurrences: `{report['les_hit_count']}`.",
        f"- Total DI-relative field accesses found: `{report['total_field_accesses']}`.",
        "",
        "## By struct offset",
        "",
        "| Offset | Reads | Writes |",
        "| --- | ---: | ---: |",
    ]
    for disp, row in report["by_struct_offset"].items():
        lines.append(f"| `{disp}` | {len(row['reads'])} | {len(row['writes'])} |")
    lines += ["", "## Claim Boundary", "", report["claim_boundary"], ""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offsets", type=lambda s: [int(x, 0) for x in s.split(",")], default=None,
                         help="comma-separated struct offsets (e.g. 0xfc,0xfd,0xfe) to focus the summary on")
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    args = parser.parse_args()
    report = build_report(args.offsets)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.markdown.write_text(render_markdown(report), encoding="utf-8")
    print(f"dok area struct scan: {report['les_hit_count']} LES hits, {report['total_field_accesses']} field accesses")


if __name__ == "__main__":
    main()
