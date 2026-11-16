#!/usr/bin/env python3
"""Inventory pinned CoK source occurrences and reconcile registry locators."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys

import daa_decode
import dax_complex_decode
import dax_decode
from cok_ecl_picture_census import strict_rle

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "docs/engine/research"
ROSTER = RESEARCH / "cok-graphics-source-roster-v1.json"
REGISTRY = RESEARCH / "cok-graphics-identity-registry-v1.json"
RECEIPT = RESEARCH / "cok-graphics-source-census-v1.json"
DOS_ROOT = ROOT / "Champions of Krynn"
AMIGA_ROOT = Path("C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn")
SOURCE_SETS = {
    "dos-install": ("DOS-EGA", "Installed DOS/GOG copy"),
    "amiga-private-extraction": ("Amiga", "Alternate three-disk extraction; clean-set provenance not established"),
}
HASH = re.compile(r"[0-9a-f]{64}")
COM = {"DUNGCOM", "RANDCOM", "WILDCOM"}
INVENTORIES = ["docs/dos-inventory.md", "docs/amiga-inventory.md"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def serialize(document):
    return (json.dumps(document, ensure_ascii=True, indent=2) + "\n").encode("utf-8")


def doc_roster(dos_doc, amiga_doc):
    dos = dos_doc.split("## 1. Champions of Krynn (CoK) — DAX Inventory", 1)[1]
    dos = dos.split("### Graphics resources subsection (CoK)", 1)[0]
    result = {}
    for name, count in re.findall(r"^\| (\S+\.DAX) \| [^|]+ \| (\d+) \| GRAPHICS\b", dos, re.M):
        result["dos-install", name] = ("structural" if name.startswith("WALLDEF") else "graphics", int(count))
    amiga = amiga_doc.split("## Champions of Krynn — Full File Inventory", 1)[1]
    amiga = amiga.split("## Death Knights of Krynn", 1)[0]
    sections = re.split(r"^### Disk (\d)[^\n]*\n", amiga, flags=re.M)
    for disk, section in zip(sections[1::2], sections[2::2], strict=True):
        for name, size, category in re.findall(r"^\| `([^\x60]+)` \| ([\d,]+) \| (\**\w+)", section, re.M):
            group = ("graphics" if category.strip("*").lower() == "graphics" else
                     "structural" if name.startswith("WALLDEF") else
                     "classification-open" if name == "pointers.daa" else None)
            if group:
                result["amiga-private-extraction", f"disk{disk}/{name}"] = (group, int(size.replace(",", "")))
    dos_counts = [count for (source, _), (_, count) in result.items() if source == "dos-install"]
    amiga_groups = Counter(group for (source, _), (group, _) in result.items() if source == "amiga-private-extraction")
    if (len(dos_counts), sum(dos_counts), amiga_groups) != (31, 538, {"graphics": 43, "structural": 2, "classification-open": 1}):
        raise ValueError("documented CoK graphics roster changed; review scope before refreshing pins")
    return result


def edition(source, relative):
    name = PurePosixPath(relative).stem.upper()
    if source == "dos-install":
        if name in {"CHEAD", "CBODY"}:
            return "DOS"
        if re.fullmatch(r"(?:BIGPIC|CPIC|PIC)[123]", name):
            return f"DOS disk {name[-1]}"
        return "DOS install"
    disk = PurePosixPath(relative).parts[0][-1]
    if re.fullmatch(r"(?:PIC|SPRIT)[12]", name):
        return f"Amiga disk{disk} candidate copy"
    if relative.lower() == "disk2/8x8d1.dax":
        return "Amiga disk 2 (candidate ADF extraction)"
    return f"Amiga disk {disk}"


def check_roster(document, expected):
    if set(document) != {"schema", *SOURCE_SETS} or document["schema"] != "cok-graphics-source-roster-v1":
        raise ValueError("unsupported source roster schema")
    seen = {}
    for source in SOURCE_SETS:
        for relative, sha, size in document[source]:
            key = source, relative
            if key in seen or key not in expected or not HASH.fullmatch(sha) or type(size) is not int or size < 1:
                raise ValueError(f"invalid or repeated source occurrence {key}")
            category, count_or_size = expected[key]
            dos = source == "dos-install"
            if not dos and size != count_or_size:
                raise ValueError(f"Amiga byte length differs from inventory: {relative}")
            seen[key] = dict(sourceSet=source, path=relative, category=category, sha256=sha,
                             bytes=size, expectedEntries=count_or_size if dos else None)
    if seen.keys() != expected.keys():
        raise ValueError(f"missing documented occurrences: {sorted(expected.keys() - seen.keys())}")
    return [seen[key] for key in sorted(seen)]


def entry_spans(data, format_name, expected):
    if format_name == "dax":
        if len(data) < 11:
            raise ValueError("dax-truncated-header")
        toc = struct.unpack_from("<H", data)[0]
        base = 2 + toc
        if not toc or toc % 9 or base > len(data):
            raise ValueError("dax-invalid-table-size")
        if expected is not None and toc // 9 != expected:
            raise ValueError("dax-entry-count-mismatch")
        spans = []
        for i in range(toc // 9):
            block, offset, raw, count = struct.unpack_from("<BIHH", data, 2 + i * 9)
            spans.append((block, base + offset, count, raw))
        return "dax-9", spans
    try:
        kind, base, entries = daa_decode.parse_container(data)
    except ValueError as exc:
        raise ValueError("daa-invalid-table") from exc
    if kind == "blocks":
        return "daa-9", [(b.block_id, base + b.data_offset, b.comp_size, b.raw_size) for b in entries]
    offsets = [offset for _, offset in entries] + [len(data) - base]
    return "daa-6", [(bid, base + off, offsets[i + 1] - off, None) for i, (bid, off) in enumerate(entries)]


def child(kind, index, width, height, *, rgb=None, indices=None, candidate=False):
    return dict(kind=kind, index=index, width=width, height=height, candidate=candidate,
                rgbSha256=digest(rgb) if rgb is not None else None,
                indexSha256=digest(indices) if indices is not None else None)


def colorize(indices, palette):
    return bytes(channel for i in indices for channel in palette[i])


def font_glyph_rgb(stored):
    if len(stored) != 8:
        raise ValueError("font glyph must contain eight stored row bytes")
    indices = [15 if row & (0x80 >> x) else 0 for row in stored for x in range(8)]
    return colorize(indices, dax_decode.EGA_PALETTE)


def entry_children(file, table, entry, payload, raw):
    name = PurePosixPath(file["path"]).stem.upper()
    block, ordinal = entry["blockId"], entry["entryIndex"]
    if table == "daa-6":
        if name in {"PIC1", "PIC2"}:
            from import_cok_amiga_pic_registry import ARCHIVES, decode_pic_block
            spec = ARCHIVES[name + ".DAA"]
            if file["sha256"] != spec["sha256"] or spec["toc"][ordinal][0] != block:
                raise ValueError("amiga-pic-profile-pin-mismatch")
            pic = decode_pic_block(payload, spec["toc"][ordinal][1])
            return "amiga-pic-index", [
                child("block-frame", f["frame"], pic["width"], pic["height"], rgb=f["rgb"]) for f in pic["frames"]
            ], []
        if name in {"SPRIT1", "SPRIT2"}:
            from import_cok_amiga_sprit_registry import ARCHIVES, decode_block
            spec = ARCHIVES[name + ".DAA"]
            if file["sha256"] != spec["sha256"]:
                raise ValueError("amiga-sprit-profile-pin-mismatch")
            sprite = decode_block(payload)
            return "amiga-sprit-tail-candidate", [
                child("block-frame", f["frame"], sprite["width"], sprite["height"],
                      rgb=f["candidateRgb"], candidate=True) for f in sprite["frames"]
            ], []
        raise NotImplementedError("unsupported-daa-index-family")
    assert raw is not None
    if table == "dax-9":
        if re.fullmatch(r"(?:PIC|SPRIT)[123]", name):
            frames = dax_complex_decode.parse_anim_frames(raw, apply_xor=False)
            if frames is None:
                raise ValueError("invalid-dax-complex-frames")
            from import_cok_dos_pic_registry import indexed_rgb
            return "dos-complex-stored-frames", [
                child("block-frame", i, f["width"], f["height"], rgb=indexed_rgb(f["pixels"], f["width"], f["height"]))
                for i, f in enumerate(frames)
            ], []
        if name == "8X8D1" and block == 201:
            from import_cok_dos_font_registry import RAW_SHA, reconstruct_sheet
            if digest(raw) != RAW_SHA:
                raise ValueError("font-block201-raw-pin-mismatch")
            sheet = reconstruct_sheet(raw)
            return "dos-raw-font-201", [child("glyph", i, 8, 8,
                rgb=font_glyph_rgb(raw[i*8:i*8+8]), indices=raw[i*8:i*8+8]) for i in range(177)], [
                child("whole-image", None, *sheet.size, rgb=sheet.tobytes())
            ]
        if name.startswith("8X8D") or name in COM | {"TILES"}:
            tiles = dax_decode.parse_ega_tile_array(raw)
            if tiles is None or tiles[:2] != ((8, 8) if name.startswith("8X8D") else (24, 24)) or (raw[8] != tiles[2] and raw[8] != 255):
                raise NotImplementedError("no-exact-dax-tile-profile")
            w, h, count, header = tiles
            preview = []
            # Whole-block image: the composed 2-column tile array, the same decode the importer uses
            # (2026-11-10 finding). The old 16-px strip read is a misdecode and is no longer used.
            if name.startswith("8X8D") and dax_decode.parse_tile_strip(raw):
                sw, sh, srgb = dax_decode.compose_ega_tile_array_rgb(raw, cols=2)
                preview.append(child("whole-image", None, sw, sh, rgb=srgb))
            return "dax-ega-tile-array", [
                child("tile", i, w, h, indices=bytes(idx), rgb=colorize(idx, dax_decode.EGA_PALETTE))
                for i, idx in enumerate(dax_decode.ega_tile_array_tiles(raw, w, h, count, header))
            ], preview
        frame = dax_decode.parse_standard_frame(raw)
        if frame is None:
            raise NotImplementedError("no-standard-dax-frame-profile")
        w, h, _, _ = frame
        return "dax-standard-frame", [child("block-frame", 0, w, h, rgb=dax_decode.frame_to_rgb(raw, w, h, dax_decode.FRAME_HEADER))], []
    small = name.startswith("8X8D")
    if small or name in COM:
        parsed = daa_decode.parse_8x8d_header(raw) if small else daa_decode.parse_com_strip_header(raw)
        if not parsed:
            raise NotImplementedError("no-daa-planar-tile-profile")
        count, *_, stride, plane = parsed
        px, palette = (8, daa_decode.EGA_PALETTE) if small else (24, daa_decode.read_palette(raw, 9))
        tiles = (daa_decode.decode_8x8d_tile(raw, count, stride, plane, i) if small
                 else daa_decode.decode_com_item(raw, stride, plane, i) for i in range(count))
        indices = (bytes(p for row in tile for p in row) for tile in tiles)
        return "daa-planar-tiles", [
            child("tile", i, px, px, indices=idx, rgb=colorize(idx, palette)) for i, idx in enumerate(indices)
        ], []
    frame = daa_decode.parse_frame_header(raw)
    if frame is None:
        raise NotImplementedError("no-standard-daa-frame-profile")
    w, h, palette, offset = frame
    return "daa-standard-frame", [child("block-frame", 0, w, h, rgb=daa_decode.planar_frame_to_rgb(raw, w, h, palette, offset))], []


def scan_file(spec, root):
    relative = spec["path"]
    ext = PurePosixPath(relative).suffix[1:].lower()
    record = dict(spec, observedSha256=None, observedBytes=None, format=None, status="missing",
                  issue=None, entries=[], children=[], derived=[], drawableCount=None)
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        record.update(status="unavailable", issue="source-path-outside-root")
        return record
    if not path.is_file():
        return record
    data = path.read_bytes()
    record.update(observedSha256=digest(data), observedBytes=len(data))
    if record["observedSha256"] != spec["sha256"] or len(data) != spec["bytes"]:
        record.update(status="pin-mismatch", issue="source-byte-pin-differs")
        return record
    if spec["category"] == "classification-open":
        record.update(status="unsupported", issue="pointer-format-and-render-role-unestablished")
        return record
    if ext == "lbm":
        from import_cok_amiga_lbm_registry import decode_rgb
        try:
            end = int.from_bytes(data[4:8], "big") + 8
            if data[:4] != b"FORM" or data[8:12] != b"ILBM" or not 12 <= end <= len(data):
                raise ValueError("iff-ilbm-form-size")
            w, h, rgb = decode_rgb(data[:end])
            record.update(format="iff-ilbm", status="scanned", drawableCount=1,
                          children=[child("whole-image", None, w, h, rgb=rgb)])
            if relative.lower().endswith(("/chars.lbm", "/chart.lbm")):
                record["issue"] = "atlas-cells-require-separate-consumer-profile"
        except (ValueError, IndexError, struct.error):
            record.update(format="iff-ilbm", status="invalid", issue="invalid-ilbm-body-or-framing")
        return record
    try:
        table, spans = entry_spans(data, ext, spec["expectedEntries"])
    except ValueError as exc:
        record.update(status="invalid", issue=str(exc))
        return record
    record.update(format=table, status="scanned")
    counts = Counter()
    # Retain malformed entries at their stored ordinal.
    for ordinal, (block, offset, length, declared) in enumerate(spans):
        counts[block] += 1
        row = dict(entryIndex=ordinal, blockId=block, sameIdOccurrence=counts[block], offset=offset,
                   storedBytes=length, declaredRawBytes=declared, payloadSha256=None, rawSha256=None,
                   status="invalid", issue=None, profile=None, drawableCount=None, children=[], derived=[])
        record["entries"].append(row)
        if length <= 0 or offset + length > len(data) or declared == 0:
            row["issue"] = "invalid-stored-span"
            continue
        if any(j != ordinal and n > 0 and offset < o + n and o < offset + length for j, (_, o, n, _) in enumerate(spans)):
            row["issue"] = "overlapping-stored-spans"
            continue
        payload = data[offset:offset + length]
        row["payloadSha256"] = digest(payload)
        try:
            raw = strict_rle(payload, declared) if declared is not None else None
        except ValueError as exc:
            row["issue"] = str(exc)
            continue
        row["rawSha256"] = digest(raw) if raw is not None else None
        if spec["category"] == "structural":
            row["status"] = row["profile"] = "structural"
            continue
        try:
            profile, children, derived = entry_children(spec, table, row, payload, raw)
            row.update(status="decoded", profile=profile, drawableCount=len(children), children=children, derived=derived)
        except NotImplementedError as exc:
            row.update(status="unsupported", issue=str(exc))
        except (ValueError, IndexError, struct.error):
            row.update(status="invalid", issue="child-profile-framing-failed")
    if all(row["drawableCount"] is not None for row in record["entries"]):
        record["drawableCount"] = sum(row["drawableCount"] for row in record["entries"])
    if any(row["status"] == "invalid" for row in record["entries"]):
        record["status"] = "partial"
    return record


def locator_matches(loc, item):
    field = {"block-frame": "frameIndex", "tile": "tileIndex", "atlas-cell": "cellIndex",
             "glyph": "glyphIndex"}.get(item["kind"])
    if item["kind"] != loc.get("kind"):
        return False
    return all(
        type(loc.get(key)) is int and loc[key] == item["index"] if key == field else loc.get(key) is None
        for key in ("frameIndex", "tileIndex", "cellIndex", "glyphIndex")
    )


def bind(files, assets):
    occurrences = {}
    projected = []
    for file in files:
        source, path = file["sourceSet"], file["path"]
        key = SOURCE_SETS[source][0], edition(source, path), PurePosixPath(path).name.lower()
        if key in occurrences:
            raise ValueError(f"ambiguous occurrence mapping: {key}")
        occurrences[key] = file
        for parent in [file, *file["entries"]]:
            parent["locatorSourceIds"] = []
            for item in parent["children"] + parent["derived"]:
                item["sourceIds"] = []
    unresolved, candidates = [], defaultdict(list)
    seen = set()
    for a in sorted((x for x in assets if x["game"] == "cok"), key=lambda a: a["id"]):
        asset_id, archive, loc = a["id"], a["archive"], a["locator"]
        if asset_id in seen:
            raise ValueError(f"duplicate registry source ID: {asset_id}")
        seen.add(asset_id)
        decoded = a.get("decoded") or {}
        projected.append({k: a[k] for k in ("id", "platform", "edition", "identityStatus", "archive", "locator")}
                         | {"rgbSha256": decoded.get("pixelSha256"),
                            "sourceContentSha256": a.get("sourceContentSha256"),
                            "sourcePixelSha256": a.get("sourcePixelSha256")})
        file = occurrences.get((a["platform"], a["edition"], archive["name"].lower()))
        parent = file
        issue = None
        archive_path = "/" + archive["path"].replace("\\", "/").lower().lstrip("/")
        suffix = ("/champions of krynn/" if a["platform"] == "DOS-EGA" else "/") + (file["path"].lower() if file else "")
        if file is None:
            issue = "no-edition-occurrence-binding"
        elif not archive_path.endswith(suffix):
            issue = "wrong-registry-occurrence-path"
        elif file["status"] not in {"scanned", "partial"} or archive.get("sha256") != file["observedSha256"]:
            issue = "missing-source-or-archive-pin-mismatch"
        elif loc.get("blockId") is not None:
            ordinal = loc.get("entryIndex")
            block = loc["blockId"]
            matches = [
                row for row in file["entries"]
                if type(block) is int and row["blockId"] == block
                and (ordinal is None or (type(ordinal) is int and row["entryIndex"] == ordinal))
            ]
            if len(matches) != 1:
                issue = "ambiguous-entry-ordinal" if len(matches) > 1 else "entry-locator-mismatch"
            else:
                parent = matches[0]
                if parent["payloadSha256"] is None:
                    issue = "entry-payload-unavailable"
        elif loc.get("entryIndex") is not None or file["format"] != "iff-ilbm":
            issue = "entry-locator-mismatch"
        if not issue:
            parent["locatorSourceIds"].append(asset_id)
            matched = [item for item in parent["children"] + parent["derived"] if locator_matches(loc, item)]
            if len(matched) == 1:
                item = matched[0]
                if item["candidate"]:
                    issue = "candidate-render"
                elif a["identityStatus"] != "source-pinned":
                    issue = "candidate-source-identity"
                elif "candidate" in a["edition"].lower():
                    issue = "unverified-edition-provenance"
                elif item["kind"] == "glyph" and (
                    item["indexSha256"] != a.get("sourceContentSha256")
                    or item["rgbSha256"] != a.get("sourcePixelSha256")
                ):
                    issue = "glyph-source-content-or-pixels-differ"
                elif item["rgbSha256"] and decoded.get("pixelSha256") and item["rgbSha256"] != decoded["pixelSha256"]:
                    issue = "decoded-rgb-hash-differs"
                else:
                    candidates[id(item)].append((asset_id, item, file, parent))
                    continue
            else:
                issue = "unresolved-child-profile" if parent["drawableCount"] is None or loc.get("kind") == "atlas-cell" else "child-locator-mismatch"
        unresolved.append(binding_issue(asset_id, file, parent, issue))
    for rows in candidates.values():
        if len(rows) == 1:
            asset_id, item, _, _ = rows[0]
            item["sourceIds"].append(asset_id)
        else:
            unresolved.extend(binding_issue(asset_id, file, parent, "competing-source-ids") for asset_id, _, file, parent in rows)
    return sorted(unresolved, key=lambda row: row["sourceId"]), digest(serialize(projected))


def binding_issue(asset_id, file, parent, issue):
    return dict(sourceId=asset_id, sourceSet=(file or {}).get("sourceSet"), path=(file or {}).get("path"),
                entryIndex=(parent or {}).get("entryIndex"), reason=issue)


def summarize(files):
    observed = {f["observedSha256"] for f in files if f["observedSha256"]}
    entries = [e for f in files for e in f["entries"]]
    structural = [f for f in files if f["category"] == "structural"]
    graphics = [f for f in files if f["category"] != "structural"]
    parents = files + entries
    children = [c for p in parents for c in p["children"]]
    derived = [c for p in parents for c in p["derived"]]
    return {
        "documentedGraphicsFiles": sum(f["category"] == "graphics" or (f["sourceSet"] == "dos-install" and f["category"] == "structural") for f in files),
        "rosterFiles": len(files), "observedFiles": sum(bool(f["observedSha256"]) for f in files),
        "pinMatchedFiles": sum(f["sha256"] == f["observedSha256"] for f in files),
        "uniqueObservedContents": len(observed),
        "storedEntries": len(entries), "entryLocatorsWithRegistryRows": sum(bool(e["locatorSourceIds"]) for e in entries),
        "filesWithRegistryEntryLocators": sum(any(e["locatorSourceIds"] for e in f["entries"]) for f in files),
        "structuralFiles": len(structural), "structuralStoredEntries": sum(len(f["entries"]) for f in structural),
        "classificationOpenFiles": sum(f["category"] == "classification-open" for f in files),
        "filesWithUnknownDrawableCount": sum(f["drawableCount"] is None for f in graphics),
        "entriesWithUnknownDrawableCount": sum(e["drawableCount"] is None for f in graphics for e in f["entries"]),
        "parsedDrawableChildren": len(children), "parsedCandidateDrawableChildren": sum(c["candidate"] for c in children),
        "drawableChildrenWithExactBinding": sum(bool(c["sourceIds"]) for c in children),
        "drawableChildrenWithoutExactBinding": sum(not c["sourceIds"] for c in children),
        "derivedViews": len(derived), "derivedViewsWithExactBinding": sum(bool(c["sourceIds"]) for c in derived),
        "totalDrawableCount": len(children) if all(f["drawableCount"] is not None for f in graphics) else None,
    }


def registry_identity_digest(assets, game="cok"):
    """Hash compact UTF-8 JSON tuples in ASCII canonical ID order (see web model)."""
    rows = []
    for a in sorted((a for a in assets if a["game"] == game), key=lambda a: a["id"]):
        loc, archive = a["locator"], a["archive"]
        rows.append([
            a["id"], a["platform"], a["edition"], a["identityStatus"],
            archive["name"], archive.get("sha256"),
            [loc.get(key) for key in ("kind", "blockId", "entryIndex", "frameIndex", "tileIndex", "cellIndex", "glyphIndex")],
            (a.get("decoded") or {}).get("pixelSha256"),
            a.get("sourceContentSha256"), a.get("sourcePixelSha256"),
        ])
    return digest(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def make_report(specs, roots, assets):
    files = [scan_file(row, roots[row["sourceSet"]]) for row in sorted(specs, key=lambda x: (x["sourceSet"], x["path"]))]
    unresolved, registry_hash = bind(files, assets)
    return dict(schema="cok-graphics-source-census-v1", game="cok",
                inventoryReferences=INVENTORIES,
                registryAssetProjectionSha256=registry_hash,
                registryAssetIdentitySha256=registry_identity_digest(assets),
                sourceSets=[dict(id=k, platform=p, provenance=note,
                                 summary=summarize([f for f in files if f["sourceSet"] == k]))
                            for k, (p, note) in SOURCE_SETS.items()],
                unresolvedRegistryBindings=unresolved, files=files)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dos-root", type=Path, default=DOS_ROOT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_ROOT)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--output", type=Path, help="create the owned receipt (must not already exist)")
    modes.add_argument("--check", type=Path, nargs="?", const=RECEIPT, help="compare without writing")
    args = parser.parse_args()
    roots = {"dos-install": args.dos_root.resolve(), "amiga-private-extraction": args.amiga_root.resolve()}
    try:
        if args.output is not None and any(args.output.resolve().is_relative_to(root) for root in roots.values()):
            raise ValueError("output must be outside both source roots")
        documented = doc_roster(*[(ROOT / p).read_text(encoding="utf-8") for p in INVENTORIES])
        specs = check_roster(json.loads(ROSTER.read_bytes()), documented)
        registry = json.loads(args.registry.read_bytes())
        if registry.get("registryVersion") != 1:
            raise ValueError("unsupported registry schema")
        report = make_report(specs, roots, registry["assets"])
        if args.output is not None:
            with args.output.open("xb") as out:
                out.write(serialize(report))
        if args.check is not None and args.check.read_bytes() != serialize(report):
            raise ValueError("source census differs from the saved receipt")
        print(json.dumps({"sourceSets": report["sourceSets"],
                          "unresolvedRegistryBindings": len(report["unresolvedRegistryBindings"])}, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"CoK graphics source census: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
