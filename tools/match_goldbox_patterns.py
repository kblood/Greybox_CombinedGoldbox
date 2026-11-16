#!/usr/bin/env python3
"""
match_goldbox_patterns.py -- first-pass cross-game pattern matcher.

Consumes the overlay carve manifest produced by `tools/carve_goldbox_overlays.py`
and emits deterministic JSON/Markdown matches:

  * focused literal "needle" hits for combat/UI/floor-setup research,
  * printable strings shared across multiple chunks/sources,
  * exact byte-window hashes at function prologues.

This is deliberately conservative. It does not decompile control flow yet; it
creates the anchor list that later Capstone/dynamic-trace tooling can follow.

Usage:
  python tools/match_goldbox_patterns.py --overlays build/goldbox-overlays.json
  python tools/match_goldbox_patterns.py --markdown docs/engine/research/pattern-match-report.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OVERLAYS = REPO_ROOT / "build" / "goldbox-overlays.json"

COMBAT_KEYWORDS = [
    "AIM",
    "ATTACK",
    "BANDAGE",
    "BATTLE",
    "CAST",
    "COMBAT",
    "DAMAGE",
    "ENCOUNTER",
    "FLEE",
    "FLOOR",
    "GUARD",
    "HIT",
    "MISS",
    "MONSTER",
    "MOVE",
    "PARTY",
    "ROUND",
    "SPELL",
    "SURRENDER",
    "TARGET",
    "TURN",
    "WAIT",
    "WALL",
]

DEFAULT_NEEDLES = [
    "A battle begins",
    "A battle begins...",
    "is hit FOR",
    "points of Damage",
    "points of damage",
    " dies. ",
    "misses",
    "and Misses",
    "Hitting for ",
    "Surrenders",
    "flees in panic",
    "is forced to flee",
    "is bandaged",
    "Guarding",
    "what do you do?",
    "~COMBAT ~WAIT ~FLEE ~PARLAY",
    "~COMBAT ~WAIT ~FLEE ~ADVANCE",
    "combat enabled",
    "Combat disabled",
    "Attack",
    "Aim",
    "Guard",
    "Bandage",
    "Cast",
    "Move",
    "Wait",
    "Turn",
    "DUNGCOM",
    "DUNGCOM1",
    "DungCom",
    "WILDCOM",
    "WildCom",
    "RANDCOM",
    "RandCom",
    "Start range error in Load24x24Set",
    "CPIC",
    "CHEAD",
    "CBODY",
    "COMSPR",
    "ICON",
    "SPRIT",
    "BackGroundTiles",
    "combat",
]

BYTE_NEEDLES = [
    {
        "name": "BackGroundTiles table prefix",
        "hex": "0100ff00ff010200ff010201ff010202ff01020301010004",
    },
    {
        "name": "BackGroundTiles wilderness/run prefix",
        "hex": "ff010200ff010201ff010202ff010203ff01020401010005",
    },
    {
        "name": "BackGroundTiles terminal sentinels",
        "hex": "0000ffffffffffff00000001ffffffff00000100ffffffff0000010000010101",
    },
]


@dataclass
class Chunk:
    id: str
    source: str
    kind: str
    file_offset: int
    size: int
    code_offset: int | None
    code_size: int | None


@dataclass
class StringHit:
    chunk_id: str
    source: str
    offset: int
    text: str


@dataclass
class SharedString:
    text: str
    normalized: str
    combat_like: bool
    hit_count: int
    source_count: int
    hits: list[StringHit]


@dataclass
class NeedleHit:
    needle: str
    chunk_id: str
    source: str
    offset: int
    context: str


@dataclass
class ByteNeedleHit:
    name: str
    hex: str
    chunk_id: str
    source: str
    offset: int
    context: str


@dataclass
class WindowMatch:
    pattern: str
    sha256: str
    hit_count: int
    source_count: int
    hits: list[StringHit]


@dataclass
class FunctionCandidate:
    chunk_id: str
    source: str
    offset: int
    size: int
    instruction_count: int
    exact_sha256: str
    normalized_sha256: str
    shape_sha256: str
    calls: int
    branches: int
    memory_operands: int
    immediate_operands: int


@dataclass
class FunctionCluster:
    normalized_sha256: str
    shape_sha256: str
    match_kind: str
    confidence: str
    source_count: int
    candidate_count: int
    exact_variants: int
    provenance: str
    candidates: list[FunctionCandidate]


def resolve_path(path: str) -> Path:
    p = Path(path)
    if p.is_absolute():
        return p
    return (REPO_ROOT / p).resolve()


def load_chunks(path: Path) -> list[Chunk]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [
        Chunk(
            id=str(x["id"]),
            source=str(x["source"]),
            kind=str(x["kind"]),
            file_offset=int(x["file_offset"]),
            size=int(x["size"]),
            code_offset=None if x.get("code_offset") is None else int(x["code_offset"]),
            code_size=None if x.get("code_size") is None else int(x["code_size"]),
        )
        for x in payload
    ]


def chunk_bytes(chunk: Chunk) -> tuple[bytes, int]:
    data = resolve_path(chunk.source).read_bytes()
    start = chunk.code_offset if chunk.code_offset is not None else chunk.file_offset
    size = chunk.code_size if chunk.code_size is not None else chunk.size
    return data[start:start + size], start


def normalize_string(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().upper())


def combat_like(s: str) -> bool:
    u = normalize_string(s)
    return any(k in u for k in COMBAT_KEYWORDS)


def extract_strings(chunks: list[Chunk], min_len: int) -> list[StringHit]:
    hits: list[StringHit] = []
    pat = rb"[\x20-\x7e]{%d,}" % min_len
    for chunk in chunks:
        data, base = chunk_bytes(chunk)
        for m in re.finditer(pat, data):
            text = m.group(0).decode("ascii", errors="replace")
            # Trim noisy huge paths/tables; keep deterministic enough context for anchors.
            if len(text) > 160:
                text = text[:157] + "..."
            hits.append(StringHit(chunk.id, chunk.source, base + m.start(), text))
    return hits


def find_shared_strings(hits: list[StringHit], min_sources: int, only_combat: bool, limit: int) -> list[SharedString]:
    groups: dict[str, list[StringHit]] = {}
    original: dict[str, str] = {}
    for h in hits:
        key = normalize_string(h.text)
        if not key:
            continue
        groups.setdefault(key, []).append(h)
        original.setdefault(key, h.text)
    out: list[SharedString] = []
    for key, hs in groups.items():
        source_count = len({h.source for h in hs})
        is_combat = combat_like(key)
        if source_count < min_sources:
            continue
        if only_combat and not is_combat:
            continue
        out.append(SharedString(original[key], key, is_combat, len(hs), source_count, hs[:12]))
    out.sort(key=lambda x: (not x.combat_like, -x.source_count, -x.hit_count, x.normalized))
    return out[:limit]


def ascii_context(data: bytes, i: int, n: int, radius: int = 48) -> str:
    lo = max(0, i - radius)
    hi = min(n, i + radius)
    raw = data[lo:hi]
    return "".join(chr(b) if 32 <= b <= 126 else "." for b in raw)


def hex_context(data: bytes, i: int, n: int, radius: int = 16) -> str:
    lo = max(0, i - radius)
    hi = min(n, i + radius)
    return data[lo:hi].hex(" ")


def find_needles(chunks: list[Chunk], needles: list[str]) -> list[NeedleHit]:
    out: list[NeedleHit] = []
    for chunk in chunks:
        data, base = chunk_bytes(chunk)
        lower = data.lower()
        for needle in needles:
            nb = needle.encode("ascii", errors="ignore").lower()
            if not nb:
                continue
            start = 0
            while True:
                i = lower.find(nb, start)
                if i < 0:
                    break
                out.append(NeedleHit(needle, chunk.id, chunk.source, base + i, ascii_context(data, i, len(data))))
                start = i + 1
    out.sort(key=lambda x: (x.needle.upper(), x.source, x.offset))
    return out


def find_byte_needles(chunks: list[Chunk], needles: list[dict[str, str]]) -> list[ByteNeedleHit]:
    out: list[ByteNeedleHit] = []
    for chunk in chunks:
        data, base = chunk_bytes(chunk)
        for needle in needles:
            nb = bytes.fromhex(needle["hex"])
            start = 0
            while True:
                i = data.find(nb, start)
                if i < 0:
                    break
                out.append(
                    ByteNeedleHit(
                        needle["name"],
                        needle["hex"],
                        chunk.id,
                        chunk.source,
                        base + i,
                        hex_context(data, i, len(data)),
                    )
                )
                start = i + 1
    out.sort(key=lambda x: (x.name, x.source, x.offset))
    return out


def find_prologue_windows(chunks: list[Chunk], window: int, min_sources: int, limit: int) -> list[WindowMatch]:
    groups: dict[tuple[str, str], list[StringHit]] = {}
    patterns = [(b"\x55\x89\xE5", "55 89 e5"), (b"\x55\x8B\xEC", "55 8b ec")]
    for chunk in chunks:
        data, base = chunk_bytes(chunk)
        for pat, label in patterns:
            start = 0
            while True:
                i = data.find(pat, start)
                if i < 0:
                    break
                blob = data[i:i + window]
                if len(blob) >= len(pat):
                    h = hashlib.sha256(blob).hexdigest()
                    groups.setdefault((label, h), []).append(StringHit(chunk.id, chunk.source, base + i, blob.hex()))
                start = i + 1
    out: list[WindowMatch] = []
    for (label, h), hs in groups.items():
        source_count = len({x.source for x in hs})
        if source_count >= min_sources:
            out.append(WindowMatch(label, h, len(hs), source_count, hs[:12]))
    out.sort(key=lambda x: (-x.source_count, -x.hit_count, x.pattern, x.sha256))
    return out[:limit]


def function_signature(data: bytes, base: int = 0, max_size: int = 512) -> FunctionCandidate | None:
    try:
        import capstone
    except ImportError:
        return None
    if not data.startswith((b"\x55\x89\xe5", b"\x55\x8b\xec")):
        return None
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    normalized = bytearray()
    shape: list[str] = []
    calls = branches = memory_operands = immediate_operands = 0
    end = 0
    instruction_count = 0
    for ins in md.disasm(data[:max_size], base):
        raw = bytearray(ins.bytes)
        for offset, size in ((ins.imm_offset, ins.imm_size), (ins.disp_offset, ins.disp_size)):
            if offset and size:
                raw[offset : offset + size] = b"\x00" * size
        normalized.extend(raw)
        operands: list[str] = []
        for operand in ins.operands:
            if operand.type == capstone.x86.X86_OP_REG:
                operands.append(f"r:{ins.reg_name(operand.reg)}")
            elif operand.type == capstone.x86.X86_OP_IMM:
                immediate_operands += 1
                operands.append("imm")
            elif operand.type == capstone.x86.X86_OP_MEM:
                memory_operands += 1
                operands.append(f"mem:{ins.reg_name(operand.mem.segment)}:{ins.reg_name(operand.mem.base)}:{ins.reg_name(operand.mem.index)}")
            else:
                operands.append("other")
        mnemonic = ins.mnemonic.lower()
        shape.append(f"{mnemonic}({','.join(operands)})")
        calls += int(mnemonic in {"call", "lcall"})
        branches += int(mnemonic.startswith("j") or mnemonic.startswith("loop"))
        instruction_count += 1
        end = ins.address + ins.size - base
        if mnemonic in {"ret", "retf", "iret"}:
            break
    if instruction_count < 3 or end <= 0 or not shape[-1].startswith(("ret(", "retf(", "iret(")):
        return None
    exact = data[:end]
    shape_bytes = "\n".join(shape).encode("ascii")
    return FunctionCandidate(
        chunk_id="",
        source="",
        offset=base,
        size=end,
        instruction_count=instruction_count,
        exact_sha256=hashlib.sha256(exact).hexdigest(),
        normalized_sha256=hashlib.sha256(normalized).hexdigest(),
        shape_sha256=hashlib.sha256(shape_bytes).hexdigest(),
        calls=calls,
        branches=branches,
        memory_operands=memory_operands,
        immediate_operands=immediate_operands,
    )


def find_function_clusters(chunks: list[Chunk], min_sources: int, limit: int) -> tuple[int, list[FunctionCluster], list[dict[str, object]]]:
    candidates: list[FunctionCandidate] = []
    patterns = (b"\x55\x89\xe5", b"\x55\x8b\xec")
    for chunk in chunks:
        data, base = chunk_bytes(chunk)
        starts = sorted({i for pattern in patterns for i in range(len(data)) if data.startswith(pattern, i)})
        for index, start in enumerate(starts):
            boundary = starts[index + 1] if index + 1 < len(starts) else len(data)
            candidate = function_signature(data[start:min(boundary, start + 512)], base + start)
            if candidate is None:
                continue
            candidate.chunk_id = chunk.id
            candidate.source = chunk.source
            candidates.append(candidate)

    groups: dict[str, list[FunctionCandidate]] = {}
    for candidate in candidates:
        groups.setdefault(candidate.normalized_sha256, []).append(candidate)
    clusters: list[FunctionCluster] = []
    correlation_index: list[dict[str, object]] = []

    def sample_distinct(members: list[FunctionCandidate], max_items: int = 16) -> list[FunctionCandidate]:
        sample: list[FunctionCandidate] = []
        seen_sources: set[str] = set()
        for member in members:
            if member.source not in seen_sources:
                sample.append(member)
                seen_sources.add(member.source)
        for member in members:
            if len(sample) >= max_items:
                break
            if member not in sample:
                sample.append(member)
        return sample[:max_items]

    def confidence_for(members: list[FunctionCandidate], source_count: int, shape_only: bool = False) -> str:
        instruction_floor = min(member.instruction_count for member in members)
        if shape_only:
            return "medium" if source_count >= 3 and instruction_floor >= 16 else "low"
        if source_count >= 3 and instruction_floor >= 8:
            return "high"
        return "medium" if instruction_floor >= 8 else "low"

    for normalized_hash, members in groups.items():
        sources = {member.source for member in members}
        if len(sources) < min_sources:
            continue
        exact_variants = len({member.exact_sha256 for member in members})
        match_kind = "exact" if exact_variants == 1 else "relocation-normalized"
        confidence = confidence_for(members, len(sources))
        for member in members:
            correlation_index.append({
                "source": member.source,
                "offset": member.offset,
                "size": member.size,
                "instruction_count": member.instruction_count,
                "normalized_sha256": normalized_hash,
                "match_kind": match_kind,
                "confidence": confidence,
                "source_count": len(sources),
            })
        clusters.append(
            FunctionCluster(
                normalized_sha256=normalized_hash,
                shape_sha256=members[0].shape_sha256,
                match_kind=match_kind,
                confidence=confidence,
                source_count=len(sources),
                candidate_count=len(members),
                exact_variants=exact_variants,
                provenance="retail-bytes",
                candidates=sample_distinct(members),
            )
        )

    shape_groups: dict[tuple[str, int, int, int, int], list[FunctionCandidate]] = {}
    for candidate in candidates:
        key = (candidate.shape_sha256, candidate.calls, candidate.branches, candidate.memory_operands, candidate.immediate_operands)
        shape_groups.setdefault(key, []).append(candidate)
    for (shape_hash, _calls, _branches, _memory, _immediates), members in shape_groups.items():
        sources = {member.source for member in members}
        normalized_variants = {member.normalized_sha256 for member in members}
        if len(sources) < min_sources or len(normalized_variants) < 2 or min(member.instruction_count for member in members) < 12:
            continue
        clusters.append(
            FunctionCluster(
                normalized_sha256="",
                shape_sha256=shape_hash,
                match_kind="control-flow-shape",
                confidence=confidence_for(members, len(sources), shape_only=True),
                source_count=len(sources),
                candidate_count=len(members),
                exact_variants=len({member.exact_sha256 for member in members}),
                provenance="retail-bytes; structural similarity only",
                candidates=sample_distinct(members),
            )
        )
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    clusters.sort(key=lambda item: (confidence_rank[item.confidence], -item.source_count, -item.candidate_count, item.normalized_sha256 or item.shape_sha256))
    byte_clusters = [item for item in clusters if item.match_kind != "control-flow-shape"]
    shape_clusters = [item for item in clusters if item.match_kind == "control-flow-shape"]
    byte_limit = max(1, (limit * 3) // 4)
    shape_limit = max(1, limit - byte_limit)
    correlation_index.sort(key=lambda item: (str(item["source"]), int(item["offset"]), str(item["normalized_sha256"])))
    return len(candidates), byte_clusters[:byte_limit] + shape_clusters[:shape_limit], correlation_index


def build_report(args: argparse.Namespace) -> dict[str, object]:
    chunks = load_chunks(args.overlays)
    strings = extract_strings(chunks, args.min_string)
    needles = DEFAULT_NEEDLES + list(args.needle or [])
    shared = find_shared_strings(strings, args.min_sources, args.combat_only, args.limit)
    needle_hits = find_needles(chunks, needles)
    byte_needle_hits = find_byte_needles(chunks, BYTE_NEEDLES)
    windows = find_prologue_windows(chunks, args.window, args.min_sources, args.limit)
    function_count, function_clusters, function_cluster_index = find_function_clusters(chunks, args.min_sources, args.limit)
    return {
        "overlay_manifest": str(args.overlays),
        "chunk_count": len(chunks),
        "string_count": len(strings),
        "needle_hits": [asdict(x) for x in needle_hits],
        "byte_needle_hits": [asdict(x) for x in byte_needle_hits],
        "shared_strings": [asdict(x) for x in shared],
        "prologue_window_matches": [asdict(x) for x in windows],
        "function_candidate_count": function_count,
        "function_clusters": [asdict(x) for x in function_clusters],
        "function_cluster_index": function_cluster_index,
    }


def md_link_source(source: str, offset: int) -> str:
    return f"`{source.replace('\\', '/')}:0x{offset:x}`"


def to_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Pattern Match Report",
        "",
        f"- Overlay manifest: `{report['overlay_manifest']}`",
        f"- Chunks scanned: {report['chunk_count']}",
        f"- Printable strings found: {report['string_count']}",
        "",
        "## Focused Needle Hits",
        "",
        "| Needle | Chunk | Offset | Context |",
        "| --- | --- | --- | --- |",
    ]
    for hit in report["needle_hits"][:300]:
        ctx = str(hit["context"]).replace("|", "\\|")
        lines.append(f"| `{hit['needle']}` | {hit['chunk_id']} | {md_link_source(hit['source'], hit['offset'])} | `{ctx}` |")
    lines.extend(["", "## Focused Byte-Pattern Hits", "", "| Pattern | Chunk | Offset | Context |", "| --- | --- | --- | --- |"])
    for hit in report["byte_needle_hits"][:120]:
        ctx = str(hit["context"]).replace("|", "\\|")
        lines.append(f"| `{hit['name']}` | {hit['chunk_id']} | {md_link_source(hit['source'], hit['offset'])} | `{ctx}` |")
    lines.extend(["", "## Shared Combat-Like Strings", "", "| Text | Sources | Hits | First locations |", "| --- | --- | --- | --- |"])
    for item in report["shared_strings"]:
        if not item["combat_like"]:
            continue
        locs = "<br>".join(md_link_source(h["source"], h["offset"]) for h in item["hits"][:4])
        text = str(item["text"]).replace("|", "\\|")
        lines.append(f"| `{text}` | {item['source_count']} | {item['hit_count']} | {locs} |")
    lines.extend(["", "## Exact Prologue Window Matches", "", "| Pattern | Sources | Hits | SHA-256 | First locations |", "| --- | --- | --- | --- | --- |"])
    for item in report["prologue_window_matches"][:80]:
        locs = "<br>".join(md_link_source(h["source"], h["offset"]) for h in item["hits"][:4])
        lines.append(f"| `{item['pattern']}` | {item['source_count']} | {item['hit_count']} | `{item['sha256'][:16]}...` | {locs} |")
    lines.extend(["", "## Normalized Function Clusters", "", "| Match | Confidence | Sources | Candidates | Instructions / data shape | First locations |", "| --- | --- | ---: | ---: | --- | --- |"])
    for item in report["function_clusters"][:120]:
        candidates = item["candidates"]
        first = candidates[0]
        shape = f"{first['instruction_count']} ins; calls {first['calls']}; branches {first['branches']}; mem {first['memory_operands']}; imm {first['immediate_operands']}"
        locs = "<br>".join(md_link_source(hit["source"], hit["offset"]) for hit in candidates[:4])
        lines.append(f"| `{item['match_kind']}` | `{item['confidence']}` | {item['source_count']} | {item['candidate_count']} | {shape} | {locs} |")
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--overlays", type=Path, default=DEFAULT_OVERLAYS, help="Overlay carve JSON manifest.")
    ap.add_argument("--json", dest="json_path", help="Write JSON report.")
    ap.add_argument("--markdown", dest="markdown_path", help="Write Markdown report.")
    ap.add_argument("--needle", action="append", help="Additional ASCII literal to search for. May repeat.")
    ap.add_argument("--min-string", type=int, default=5, help="Minimum printable string length.")
    ap.add_argument("--min-sources", type=int, default=2, help="Minimum distinct sources for shared matches.")
    ap.add_argument("--limit", type=int, default=250, help="Maximum shared string/window matches to emit.")
    ap.add_argument("--window", type=int, default=48, help="Byte-window length for exact prologue hashes.")
    ap.add_argument("--combat-only", action="store_true", help="Only emit shared strings containing combat-like keywords.")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    if not args.overlays.exists():
        raise SystemExit(f"ERROR: overlay manifest not found: {args.overlays}")
    report = build_report(args)
    payload = json.dumps(report, indent=2, sort_keys=True)
    if args.json_path:
        Path(args.json_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_path).write_text(payload + "\n", encoding="utf-8")
    if args.markdown_path:
        Path(args.markdown_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown_path).write_text(to_markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload)
    else:
        print(f"pattern chunks: {report['chunk_count']}")
        print(f"strings: {report['string_count']}")
        print(f"needle hits: {len(report['needle_hits'])}")
        print(f"byte-pattern hits: {len(report['byte_needle_hits'])}")
        print(f"shared strings: {len(report['shared_strings'])}")
        print(f"prologue windows: {len(report['prologue_window_matches'])}")
        print(f"function candidates: {report['function_candidate_count']}")
        print(f"normalized function clusters: {len(report['function_clusters'])}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
