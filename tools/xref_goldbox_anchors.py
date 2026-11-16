#!/usr/bin/env python3
"""
xref_goldbox_anchors.py -- focused string/table xref candidate finder.

Consumes the JSON emitted by `tools/match_goldbox_patterns.py` and follows a
small set of combat anchors back to nearby 16-bit code references. This is not a
full decompiler; it creates a reproducible shortlist for the next manual/static
pass.

Usage:
  python tools/xref_goldbox_anchors.py --patterns build/goldbox-patterns.json
  python tools/xref_goldbox_anchors.py --markdown docs/engine/research/combat-anchor-xrefs.md
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import gen1_map


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATTERNS = REPO_ROOT / "build" / "goldbox-patterns.json"

ANCHOR_NEEDLES = {
    "a battle begins",
    "is hit for",
    "points of damage",
    "points of damage",
    " dies. ",
    "hitting for ",
    "and misses",
    "is forced to flee",
    "surrenders",
    "guarding",
    "is bandaged",
    "move/attack",
    "aim",
    "attack",
    "bandage",
    "dungcom",
    "dungcom1",
    "wildcom",
    "randcom",
    "start range error in load24x24set",
    "cpic",
    "comspr",
    "chead",
    "cbody",
    "~combat ~wait ~flee ~parlay",
    "~combat ~wait ~flee ~advance",
    "combat enabled",
}

INTERESTING_PREV = {
    0x68: "push imm16",
    0xB8: "mov ax,imm16",
    0xB9: "mov cx,imm16",
    0xBA: "mov dx,imm16",
    0xBB: "mov bx,imm16",
    0xBC: "mov sp,imm16",
    0xBD: "mov bp,imm16",
    0xBE: "mov si,imm16",
    0xBF: "mov di,imm16",
}


@dataclass(frozen=True)
class Anchor:
    name: str
    kind: str
    source: str
    offset: int
    chunk_id: str


@dataclass
class RefCandidate:
    anchor: Anchor
    target_word: int
    ref_offset: int
    prev_byte: int | None
    kind: str
    function_start: int | None
    context_hex: str
    disasm: list[str]
    cluster_match_kind: str | None = None
    cluster_confidence: str | None = None
    cluster_source_count: int | None = None
    cluster_hash: str | None = None
    address_translation: str | None = None


@dataclass
class RawRef:
    target_word: int
    ref_offset: int
    prev_byte: int | None
    kind: str
    function_start: int | None
    context_hex: str
    disasm: list[str]


def resolve_path(path: str) -> Path:
    p = Path(path)
    if p.is_absolute():
        return p
    return (REPO_ROOT / p).resolve()


def load_patterns(path: Path) -> list[Anchor]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    anchors: dict[tuple[str, str, int, str], Anchor] = {}
    for hit in payload.get("needle_hits", []):
        name = str(hit["needle"])
        key = name.lower()
        if not any(a in key for a in ANCHOR_NEEDLES):
            continue
        anchor = Anchor(name=name, kind="string", source=str(hit["source"]), offset=int(hit["offset"]), chunk_id=str(hit["chunk_id"]))
        anchors[(anchor.name, anchor.source, anchor.offset, anchor.kind)] = anchor
    for hit in payload.get("byte_needle_hits", []):
        anchor = Anchor(name=str(hit["name"]), kind="byte-pattern", source=str(hit["source"]), offset=int(hit["offset"]), chunk_id=str(hit["chunk_id"]))
        anchors[(anchor.name, anchor.source, anchor.offset, anchor.kind)] = anchor
    out = list(anchors.values())
    out.sort(key=lambda x: (x.source, x.offset, x.name))
    return out


def find_prev_prologue(data: bytes, at: int, window: int) -> int | None:
    lo = max(0, at - window)
    best = None
    for pat in (b"\x55\x89\xe5", b"\x55\x8b\xec"):
        start = lo
        while True:
            i = data.find(pat, start, at + 1)
            if i < 0:
                break
            if best is None or i > best:
                best = i
            start = i + 1
    return best


def context_hex(data: bytes, at: int, radius: int = 12) -> str:
    lo = max(0, at - radius)
    hi = min(len(data), at + radius)
    return data[lo:hi].hex(" ")


def disasm_preview(data: bytes, start: int | None, ref: int, length: int) -> list[str]:
    try:
        import capstone
    except ImportError:
        return []
    base = start if start is not None else max(0, ref - 8)
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    lines: list[str] = []
    for ins in md.disasm(data[base:base + length], base):
        marker = ">" if ins.address <= ref < ins.address + len(ins.bytes) else " "
        lines.append(f"{marker}0x{ins.address:06x}: {ins.bytes.hex():<16} {ins.mnemonic} {ins.op_str}".rstrip())
        if len(lines) >= 12:
            break
    return lines


def fallback_byte_refs(data: bytes, targets: set[int], max_refs: int, prologue_window: int) -> dict[int, list[RawRef]]:
    refs: dict[int, list[RawRef]] = {t: [] for t in targets}
    for target in targets:
        needle = bytes([target & 0xFF, (target >> 8) & 0xFF])
        start = 0
        while True:
            i = data.find(needle, start)
            if i < 0:
                break
            prev = data[i - 1] if i > 0 else None
            kind = INTERESTING_PREV.get(prev, "?") if prev is not None else "?"
            if kind != "?" or len(refs[target]) < 4:
                fn = find_prev_prologue(data, i, prologue_window)
                refs[target].append(
                    RawRef(
                        target_word=target,
                        ref_offset=i,
                        prev_byte=prev,
                        kind=kind,
                        function_start=fn,
                        context_hex=context_hex(data, i),
                        disasm=disasm_preview(data, fn, i, 0x90),
                    )
                )
            start = i + 1
            if len(refs[target]) >= max_refs:
                break
    return refs


def scan_source_refs(source: str, targets: set[int], max_refs: int, prologue_window: int) -> dict[int, list[RawRef]]:
    data = resolve_path(source).read_bytes()
    refs: dict[int, list[RawRef]] = {t: [] for t in targets}
    try:
        import capstone
    except ImportError:
        return fallback_byte_refs(data, targets, max_refs, prologue_window)

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    for code_off in range(0, max(0, len(data) - 1)):
        if all(len(v) >= max_refs for v in refs.values()):
            break
        try:
            ins_iter = md.disasm(data[code_off:code_off + 8], code_off)
            ins = next(ins_iter, None)
        except capstone.CsError:
            continue
        if ins is None:
            continue
        mnemonic = ins.mnemonic.lower()
        if (
            mnemonic.startswith("j")
            or mnemonic in {"call", "lcall", "loop", "loope", "loopne", "ret", "retf", "iret"}
        ):
            continue
        matched: set[int] = set()
        for op in ins.operands:
            val = None
            if op.type == capstone.x86.X86_OP_IMM:
                val = op.imm & 0xFFFF
            elif op.type == capstone.x86.X86_OP_MEM and op.mem.disp:
                val = op.mem.disp & 0xFFFF
            if val in targets:
                matched.add(val)
        if not matched:
            continue
        for target in matched:
            if len(refs[target]) >= max_refs:
                continue
            prev = data[code_off] if code_off < len(data) else None
            fn = find_prev_prologue(data, code_off, prologue_window)
            refs[target].append(
                RawRef(
                    target_word=target,
                    ref_offset=code_off,
                    prev_byte=prev,
                    kind=f"{ins.mnemonic} {ins.op_str}".strip(),
                    function_start=fn,
                    context_hex=context_hex(data, code_off),
                    disasm=disasm_preview(data, fn, code_off, 0x90),
                )
            )
    return refs


def scan_clustered_function_refs(
    source: str,
    targets: set[int],
    candidates: list[dict[str, object]],
    max_refs: int,
) -> dict[int, list[RawRef]]:
    refs: dict[int, list[RawRef]] = {target: [] for target in targets}
    if not candidates or not targets:
        return refs
    try:
        import capstone
    except ImportError:
        return refs
    data = resolve_path(source).read_bytes()
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    for candidate in candidates:
        start = int(candidate["offset"])
        size = int(candidate["size"])
        if start < 0 or size <= 0 or start + size > len(data):
            continue
        expected = start
        for ins in md.disasm(data[start:start + size], start):
            if ins.address != expected:
                break
            expected += ins.size
            mnemonic = ins.mnemonic.lower()
            if mnemonic.startswith("j") or mnemonic in {"call", "lcall", "ret", "retf", "iret"}:
                continue
            matched: set[int] = set()
            for operand in ins.operands:
                if operand.type == capstone.x86.X86_OP_IMM:
                    value = operand.imm & 0xFFFF
                elif operand.type == capstone.x86.X86_OP_MEM and operand.mem.disp:
                    value = operand.mem.disp & 0xFFFF
                else:
                    continue
                if value in targets:
                    matched.add(value)
            for target in matched:
                if len(refs[target]) >= max_refs:
                    continue
                refs[target].append(
                    RawRef(
                        target_word=target,
                        ref_offset=ins.address,
                        prev_byte=data[ins.address] if ins.address < len(data) else None,
                        kind=f"{ins.mnemonic} {ins.op_str}".strip(),
                        function_start=start,
                        context_hex=context_hex(data, ins.address),
                        disasm=disasm_preview(data, start, ins.address, min(size, 0x90)),
                    )
                )
    return refs


def load_overlay_chunks(pattern_payload: dict[str, object], patterns_path: Path) -> list[dict[str, object]]:
    manifest = Path(str(pattern_payload.get("overlay_manifest", "")))
    if not manifest.is_absolute():
        manifest = (patterns_path.parent.parent / manifest).resolve() if not manifest.exists() else manifest.resolve()
    if not manifest.exists():
        return []
    return json.loads(manifest.read_text(encoding="utf-8"))


def translate_anchor(
    anchor: Anchor,
    chunks: list[dict[str, object]],
    descriptor_cache: dict[str, list[gen1_map.VroommDescriptor]],
) -> tuple[int | None, str, int | None, int | None]:
    source_path = resolve_path(anchor.source)
    if source_path.name.upper() == "GAME.OVR":
        cache_key = str(source_path)
        descriptors = descriptor_cache.get(cache_key)
        if descriptors is None:
            loader_path = source_path.with_name("START.EXE")
            if not loader_path.exists():
                loader_path = source_path.with_name("GAME.EXE")
            descriptors = gen1_map.scan_descriptors(loader_path.read_bytes(), source_path.read_bytes()) if loader_path.exists() else []
            descriptor_cache[cache_key] = descriptors
        for descriptor in descriptors:
            end = descriptor.next_ovr_file_offset or (descriptor.ovr_file_offset + descriptor.code_size + descriptor.fixup_size)
            if descriptor.ovr_file_offset <= anchor.offset < end:
                relative = anchor.offset - descriptor.ovr_file_offset
                if relative <= 0xFFFF:
                    return relative, f"vroomm-overlay-{descriptor.index}-relative", descriptor.ovr_file_offset, end
        return None, "vroomm-anchor-outside-descriptor-spans", None, None

    chunk = next(
        (
            row for row in chunks
            if str(Path(str(row.get("source", ""))).resolve()) == str(source_path.resolve())
            and str(row.get("id")) == anchor.chunk_id
            and int(row.get("file_offset", 0)) <= anchor.offset < int(row.get("file_offset", 0)) + int(row.get("size", 0))
        ),
        None,
    )
    if chunk is None:
        return None, "code-chunk-not-found", None, None
    if chunk.get("kind") == "rtlink-overlay" and chunk.get("code_offset") is not None:
        segment_base = int(chunk["code_offset"]) & ~0xF
        relative = anchor.offset - segment_base
        if 0 <= relative <= 0xFFFF:
            prefix_source = "verified" if chunk.get("prefix_bytes") is not None else "descriptor-approximation"
            return relative, f"rtlink-overlay-{chunk.get('overlay_id')}-segment-relative-{prefix_source}", int(chunk["file_offset"]), int(chunk["file_offset"]) + int(chunk["size"])
        return None, "rtlink-anchor-outside-16bit-segment", None, None
    return None, f"unsupported-{chunk.get('kind', 'chunk')}-address-space", None, None


def refs_for_anchor(anchor: Anchor, raw_refs: dict[int, list[RawRef]], target: int | None = None, translation: str | None = None) -> list[RefCandidate]:
    target = (anchor.offset & 0xFFFF) if target is None else target
    refs: list[RefCandidate] = []
    for raw in raw_refs.get(target, []):
        refs.append(
            RefCandidate(
                anchor=anchor,
                target_word=target,
                ref_offset=raw.ref_offset,
                prev_byte=raw.prev_byte,
                kind=raw.kind,
                function_start=raw.function_start,
                context_hex=raw.context_hex,
                disasm=raw.disasm,
                address_translation=translation,
            )
        )
    return refs


def word_refs_for_anchor(anchor: Anchor, max_refs: int, prologue_window: int) -> list[RefCandidate]:
    data = resolve_path(anchor.source).read_bytes()
    target = anchor.offset & 0xFFFF
    refs: list[RefCandidate] = []
    raw_refs = fallback_byte_refs(data, {target}, max_refs, prologue_window).get(target, [])
    for raw in raw_refs:
        refs.append(
            RefCandidate(
                anchor=anchor,
                target_word=target,
                ref_offset=raw.ref_offset,
                prev_byte=raw.prev_byte,
                kind=raw.kind,
                function_start=raw.function_start,
                context_hex=raw.context_hex,
                disasm=raw.disasm,
            )
        )
    return refs


def build_report(args: argparse.Namespace) -> dict[str, object]:
    pattern_payload = json.loads(args.patterns.read_text(encoding="utf-8"))
    cluster_index: dict[tuple[str, int], dict[str, object]] = {}
    candidates_by_source: dict[str, list[dict[str, object]]] = {}
    kind_rank = {"exact": 0, "relocation-normalized": 1, "control-flow-shape": 2}
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    for candidate in pattern_payload.get("function_cluster_index", []):
        candidates_by_source.setdefault(str(candidate["source"]), []).append(candidate)
        key = (str(candidate["source"]), int(candidate["offset"]))
        previous = cluster_index.get(key)
        rank = (kind_rank.get(str(candidate["match_kind"]), 9), confidence_rank.get(str(candidate["confidence"]), 9))
        previous_rank = (99, 99) if previous is None else (
            kind_rank.get(str(previous["match_kind"]), 9), confidence_rank.get(str(previous["confidence"]), 9)
        )
        if rank < previous_rank:
            cluster_index[key] = candidate
    anchors = load_patterns(args.patterns)
    overlay_chunks = load_overlay_chunks(pattern_payload, args.patterns)
    descriptor_cache: dict[str, list[gen1_map.VroommDescriptor]] = {}
    refs: list[RefCandidate] = []
    translations: dict[tuple[str, int, str], tuple[int | None, str]] = {}
    selected = anchors[: args.max_anchors]
    by_source: dict[str, list[Anchor]] = {}
    for anchor in selected:
        by_source.setdefault(anchor.source, []).append(anchor)
    for source, source_anchors in by_source.items():
        translated = [(anchor, *translate_anchor(anchor, overlay_chunks, descriptor_cache)) for anchor in source_anchors]
        for anchor, target, translation, _span_start, _span_end in translated:
            translations[(anchor.source, anchor.offset, anchor.name)] = (target, translation)
        address_spaces: dict[tuple[int, int, str], list[tuple[Anchor, int]]] = {}
        for anchor, target, translation, span_start, span_end in translated:
            if target is not None and span_start is not None and span_end is not None:
                address_spaces.setdefault((span_start, span_end, translation), []).append((anchor, target))
        for (span_start, span_end, translation), space_anchors in address_spaces.items():
            targets = {target for _anchor, target in space_anchors}
            space_candidates = [
                candidate for candidate in candidates_by_source.get(source, [])
                if span_start <= int(candidate["offset"]) < span_end
            ]
            source_refs = scan_clustered_function_refs(source, targets, space_candidates, args.max_refs_per_anchor)
            for anchor, target in space_anchors:
                refs.extend(refs_for_anchor(anchor, source_refs, target, translation)[: args.max_refs_per_anchor])
    correlated = 0
    for ref in refs:
        if ref.function_start is None:
            continue
        cluster = cluster_index.get((ref.anchor.source, ref.function_start))
        if cluster is None:
            continue
        ref.cluster_match_kind = str(cluster["match_kind"])
        ref.cluster_confidence = str(cluster["confidence"])
        ref.cluster_source_count = int(cluster["source_count"])
        ref.cluster_hash = str(cluster["normalized_sha256"])
        correlated += 1

    symbols: list[dict[str, object]] = []
    symbol_groups: dict[tuple[str, str], list[RefCandidate]] = {}
    for ref in refs:
        mnemonic = ref.kind.split(" ", 1)[0].lower()
        if ref.cluster_hash and ref.cluster_confidence in {"high", "medium"} and mnemonic in {"push", "mov", "lea", "cmp"}:
            symbol_groups.setdefault((ref.cluster_hash, ref.anchor.name), []).append(ref)
    for (cluster_hash, anchor_name), members in symbol_groups.items():
        unique_locations: dict[tuple[str, int | None, int], RefCandidate] = {}
        for member in members:
            unique_locations[(member.anchor.source, member.function_start, member.ref_offset)] = member
        members = list(unique_locations.values())
        xref_sources = {member.anchor.source for member in members}
        if len(xref_sources) < 2:
            continue
        slug = re.sub(r"[^a-z0-9]+", "_", anchor_name.lower()).strip("_")[:40] or "anchor"
        symbols.append({
            "candidate_symbol": f"candidate_{slug}_{cluster_hash[:8]}",
            "anchor": anchor_name,
            "cluster_hash": cluster_hash,
            "match_kind": members[0].cluster_match_kind,
            "confidence": "high" if len(xref_sources) >= 3 and members[0].cluster_confidence == "high" else "medium",
            "xref_source_count": len(xref_sources),
            "cluster_source_count": members[0].cluster_source_count,
            "provenance": "retail-byte anchor xref plus cross-source function cluster",
            "locations": [
                {"source": member.anchor.source, "function_start": member.function_start, "ref_offset": member.ref_offset}
                for member in members
            ],
        })
    symbols.sort(key=lambda item: (-int(item["xref_source_count"]), str(item["candidate_symbol"])))
    return {
        "patterns": str(args.patterns),
        "anchor_count": len(anchors),
        "xref_count": len(refs),
        "translated_anchor_count": sum(1 for target, _reason in translations.values() if target is not None),
        "untranslated_anchor_count": sum(1 for target, _reason in translations.values() if target is None),
        "translation_reasons": dict(sorted(Counter(reason for target, reason in translations.values() if target is None).items())),
        "cluster_correlated_xrefs": correlated,
        "candidate_symbol_count": len(symbols),
        "candidate_symbols": symbols,
        "xrefs": [asdict(x) for x in refs],
    }


def md_source(source: str, offset: int) -> str:
    clean = source.replace("\\", "/")
    return f"`{clean}:0x{offset:x}`"


def to_markdown(report: dict[str, object]) -> str:
    xrefs = report["xrefs"]
    by_anchor: dict[tuple[str, str, int, str], list[dict[str, object]]] = {}
    for ref in xrefs:
        a = ref["anchor"]
        key = (a["name"], a["source"], int(a["offset"]), a["kind"])
        by_anchor.setdefault(key, []).append(ref)

    lines = [
        "# Combat Anchor Xrefs",
        "",
        f"- Pattern report: `{report['patterns']}`",
        f"- Anchors considered: {report['anchor_count']}",
        f"- Xref candidates emitted: {report['xref_count']}",
        f"- Segment/overlay-relative anchors translated: {report['translated_anchor_count']}; untranslated: {report['untranslated_anchor_count']}",
        f"- Xrefs correlated to cross-source function clusters: {report['cluster_correlated_xrefs']}",
        f"- Conservative candidate symbols: {report['candidate_symbol_count']}",
        "",
        "These are candidate 16-bit word references to the anchor file offset low word. They are",
        "evidence for manual follow-up, not final routine boundaries by themselves.",
        "",
    ]
    for (name, source, offset, kind), refs in sorted(by_anchor.items(), key=lambda kv: (kv[0][1], kv[0][2], kv[0][0])):
        lines.extend([
            f"## `{name}`",
            "",
            f"- Anchor: {md_source(source, offset)}",
            f"- Kind: `{kind}`; target word: `0x{offset & 0xffff:04x}`",
            "",
            "| Ref | Form | Function start | Cluster | Context |",
            "| --- | --- | --- | --- | --- |",
        ])
        for ref in refs[:8]:
            fn = ref["function_start"]
            fn_text = "none" if fn is None else md_source(source, int(fn))
            cluster_text = "-" if not ref.get("cluster_hash") else f"`{ref['cluster_match_kind']}` / `{ref['cluster_confidence']}` / {ref['cluster_source_count']} sources"
            lines.append(
                f"| {md_source(source, int(ref['ref_offset']))} | `{ref['kind']}` | {fn_text} | {cluster_text} | `{ref['context_hex']}` |"
            )
        preview = next((r.get("disasm") for r in refs if r.get("disasm")), None)
        if preview:
            lines.extend(["", "```asm"])
            lines.extend(str(x) for x in preview)
            lines.extend(["```", ""])
        else:
            lines.append("")
    if report["candidate_symbols"]:
        lines.extend(["", "# Conservative Candidate Symbols", "", "These names are navigation labels, not recovered original symbols. Promotion requires the same anchor/cluster relationship in at least two retail sources.", "", "| Candidate | Anchor | Match | Confidence | Xref sources / cluster sources | First locations |", "| --- | --- | --- | --- | --- | --- |"])
        for symbol in report["candidate_symbols"]:
            locations = "<br>".join(md_source(location["source"], int(location["function_start"])) for location in symbol["locations"][:4])
            lines.append(f"| `{symbol['candidate_symbol']}` | `{symbol['anchor']}` | `{symbol['match_kind']}` | `{symbol['confidence']}` | {symbol['xref_source_count']} / {symbol['cluster_source_count']} | {locations} |")
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--patterns", type=Path, default=DEFAULT_PATTERNS, help="JSON report from match_goldbox_patterns.py")
    ap.add_argument("--json", dest="json_path", help="Write JSON report.")
    ap.add_argument("--markdown", dest="markdown_path", help="Write Markdown report.")
    ap.add_argument("--max-anchors", type=int, default=1000)
    ap.add_argument("--max-refs-per-anchor", type=int, default=16)
    ap.add_argument("--prologue-window", type=int, default=0x800)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    if not args.patterns.exists():
        raise SystemExit(f"ERROR: pattern report not found: {args.patterns}")
    report = build_report(args)
    if args.json_path:
        Path(args.json_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_path).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.markdown_path:
        Path(args.markdown_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown_path).write_text(to_markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"anchors: {report['anchor_count']}")
        print(f"xrefs: {report['xref_count']}")
        print(f"cluster-correlated xrefs: {report['cluster_correlated_xrefs']}")
        print(f"candidate symbols: {report['candidate_symbol_count']}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
