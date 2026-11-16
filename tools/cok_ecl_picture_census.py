#!/usr/bin/env python3
"""Pinned 22-block CoK archive inventory and conservative static PICTURE findings.

No game/VM execution, dialogue/raw-code export, image-bank inference or registry mutation.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import struct
from typing import Any

import cok_ecl_picture_consumers as scanner

ROOT = Path(__file__).resolve().parents[1]
RECEIPT = ROOT / "docs/engine/research/cok-ecl-picture-census-2026-11-03.json"
ARCHIVES = {
    "ECL1.DAX": {"sha256": "6387021ed8c84f2834d32d7c5e66dd03b88322d0c5072cba6cfb64a48e9ccf79", "bytes": 31721, "blocks": [
        (16, 3813, "826dd124d05280ab588e94d6bf6c6c4994fdc99acf250d6ae5aa1d304fff4537"),
        (17, 7678, "94dabe74942985aab782c37df0d4ea38ae66b63a166e5251662d03998dc004cc"),
        (18, 144, "32e8b9d0fea6925cc8456b7d602a7d7c92a2b0be086d537d918458489c6a403b"),
        (32, 7611, "db03a12fcc5857b6e5f2da2b026edf5b66bd5b54c23628f62319a05627df078f"),
        (33, 4626, "28c1f857fa76f47e919dc3a1396f6920d305862067959db3335ebd7aa718c219"),
        (34, 6497, "66ec7047a86f22200bb746f98733d73274ddbec8a385e007c578258232d110fe"),
        (36, 415, "b39bdf183f0690598042ea6a28df350b76f0927dd9b1e84c198861cec5ee58dd")]},
    "ECL2.DAX": {"sha256": "4f4ba999b0d46817091e82fe5ccf27cb6eee95cd833389353d7285c2a8dccbea", "bytes": 49982, "blocks": [
        (48, 7456, "cb37a047169ca61bde0cdffbcf835289853e951f5239bca22d9d6483380866bf"),
        (49, 6956, "58640ee7c75ca1cba9a98c6b1eebe3cf9963440b5957f51a92041e602aa49b9c"),
        (50, 7662, "b7c0d74f4a97b36c31f5016aea7d50c0c22a651ccc0da865bc0cc8a40849539c"),
        (57, 1096, "96230e908f62a14a289c3cda086c8dc0e43e93e1e8d755a83cde6730300bff8e"),
        (64, 5429, "f890f396908bb4f9e5242d12e23dd64ee04332195a9ab43e0b6f474236b722a1"),
        (66, 5240, "4a84de8f9523fc5372f20e699a5c653e1af01352b2bfdf26f9f1fac0313ae3d3"),
        (67, 7288, "73a0ab94fe66dab8bd0fdae8e6e6b9a046db762df24b1543bdaf672ad4821465"),
        (68, 7624, "7afe9f99f4d2ab1179b5023856a5e401598f076ec0f24866d4669b5d5f15261b")]},
    "ECL3.DAX": {"sha256": "9629aa3ef46bb354270aab1fa3e158d5b1507363bdf452fec5ca5d190f602f1f", "bytes": 49969, "blocks": [
        (80, 7622, "fe18f974f4f8c0d08240e60e57f6fbddba53c78c279280871ede60a5f8a3fbac"),
        (81, 6390, "36e1e85e8bc5a199e6d1009c90be0252b7d810998960922265167105510d1e0b"),
        (82, 7523, "d2461e4d715a69d4bdbf0ab2134406e03d0860f2865f0e225339a820f23b69ec"),
        (96, 7301, "e44954a166f7d48dacfad9f604cd569eda76a2f8106584e5f2f72828df169426"),
        (97, 7678, "bd4f8da73cddde06dd928c913726f24719efde2ec70faacd3ef97e11d1f1f9bf"),
        (98, 5662, "7795584ce090d136ea4013c78a27ba5dd5a590a48c1498f701d477cd23b1c31e"),
        (99, 6612, "be79dd85cbae452fc95cb81af86ad4f4144d520a08214e93634b6116e0d18bd1")]},
}


def strict_rle(data: bytes, expected: int) -> bytes:
    result = bytearray(); pos = 0
    while pos < len(data):
        control = data[pos]; pos += 1
        count = control + 1 if control < 128 else 256 - control
        needed = count if control < 128 else 1
        if pos + needed > len(data):
            raise ValueError("Truncated DAX compressed run")
        if len(result) + count > expected:
            raise ValueError("DAX decompressed run exceeds pinned size")
        result.extend(data[pos:pos+count] if control < 128 else data[pos:pos+1] * count)
        pos += needed
    if len(result) != expected:
        raise ValueError("DAX decompressed size differs")
    return bytes(result)


def read_archive(data: bytes, spec: dict[str, Any]) -> list[dict[str, Any]]:
    if scanner.sha(data) != spec["sha256"] or len(data) != spec["bytes"]:
        raise ValueError("Archive SHA/size differs from pinned census")
    if len(data) < 2:
        raise ValueError("Truncated DAX header")
    table = int.from_bytes(data[:2], "little"); base = table + 2
    if not table or table % 9 or base > len(data):
        raise ValueError("Invalid/truncated DAX table")
    expected = spec["blocks"]
    if table != len(expected) * 9:
        raise ValueError("DAX ordered table roster differs")
    result, ranges, ids = [], [], []
    for index, (block_id, raw_bytes, block_sha) in enumerate(expected):
        found, relative, declared_raw, compressed_bytes = struct.unpack_from("<BIHH", data, 2 + index * 9)
        if found != block_id or found in ids:
            raise ValueError("DAX ordered table block IDs differ or duplicate")
        ids.append(found)
        start, end = base + relative, base + relative + compressed_bytes
        if raw_bytes < 22 or declared_raw != raw_bytes or compressed_bytes == 0 or start < base or end > len(data):
            raise ValueError("DAX block range or declared size differs")
        if any(start < prior_end and prior_start < end for prior_start, prior_end in ranges):
            raise ValueError("DAX compressed block ranges overlap")
        ranges.append((start, end))
        raw = strict_rle(data[start:end], raw_bytes)
        if scanner.sha(raw) != block_sha:
            raise ValueError("Decompressed block SHA differs from census pin")
        result.append({"blockId": block_id, "rawBytes": raw_bytes, "blockSha256": block_sha,
                       "compressedFileOffset": start, "compressedBytes": compressed_bytes, "raw": raw})
    return result


def site_key(archive: str, block_id: int, offset: int) -> str:
    return f"{archive}#{block_id}@{offset}"


def compact_witness(path: list[dict[str, Any]]) -> dict[str, Any]:
    # Witness counts/digests stay compact; the shared scanner can reproduce full paths.
    offsets, branches, previous = [], [], None
    for step in path:
        if "offset" in step:
            previous = step["offset"]; offsets.append(previous)
        elif step.get("edge") not in (None, "fallthrough"):
            branches.append({"fromOffset": previous, "edge": step["edge"]})
    return {"instructionSteps": len(offsets), "offsetPathSha256": scanner.sha(json.dumps(offsets, separators=(',', ':')).encode()),
            "branchEdgeCount": len(branches), "branchEdgesSha256": scanner.sha(json.dumps(branches, separators=(',', ':')).encode())}


def inspect_archive(name: str, data: bytes, spec: dict[str, Any], budget: int = 50000) -> dict[str, Any]:
    blocks = read_archive(data, spec)
    findings = []
    for block in blocks:
        report = scanner.scan_picture_sites(block["raw"], budget)
        sites = [{"key": site_key(name, block["blockId"], site["offset"]), "offset": site["offset"],
            "vaddr": site["vaddr"], "operand": site["operand"], "pictureId": site["pictureId"],
            "entries": site["entries"], "entryWitnesses": [{"entry": witness["entry"], **compact_witness(witness["steps"])}
                for witness in site["paths"]]} for site in report["pictureSites"]]
        issues = [{**{key: value for key, value in issue.items() if key != "path"},
                   **({"witness": compact_witness(issue["path"])} if "path" in issue else {})} for issue in report["issues"]]
        findings.append({"blockId": block["blockId"], "instructionCount": report["instructionCount"],
            "expandedEntryStates": report["expandedEntryStates"], "headerEntries": report["entries"],
            "pictureSites": sites, "issues": issues, "complete": False})
    return {"archive": name, "archiveSha256": spec["sha256"], "archiveBytes": len(data),
        "inventory": [{key: value for key, value in block.items() if key != "raw"} for block in blocks], "staticFindings": findings}


def build_census(dos_root: Path = ROOT / "Champions of Krynn", budget: int = 50000) -> dict[str, Any]:
    missing = [str(dos_root / name) for name in ARCHIVES if not (dos_root / name).is_file()]
    if missing:
        raise FileNotFoundError("Census prerequisites missing: " + ", ".join(missing))
    archives = [inspect_archive(name, (dos_root / name).read_bytes(), spec, budget) for name, spec in ARCHIVES.items()]
    blocks = [block for archive in archives for block in archive["staticFindings"]]
    sites = [site for block in blocks for site in block["pictureSites"]]
    issues = [issue for block in blocks for issue in block["issues"]]
    baseline = archives[0]["staticFindings"][0]
    if [(site["offset"], site["pictureId"]) for site in baseline["pictureSites"]] != [
            (76,121), (1376,114), (1651,18), (1800,121), (3004,58), (3027,58), (3036,121)]:
        raise ValueError("ECL1#16 seven-site source baseline differs")
    return {"schema": "cok-ecl-picture-census-v1", "task": "SCENE-CENSUS-22", "archives": archives,
        "inventoryCoverage": {"archives": len(archives), "blocks": len(blocks), "allPinnedInventoryInspected": True},
        "staticSummary": {"instructionSites": sum(block["instructionCount"] for block in blocks),
            "pictureSites": len(sites), "immediatePictureSites": sum(site["pictureId"] is not None for site in sites),
            "dynamicPictureSites": sum(site["pictureId"] is None for site in sites), "issueEvents": len(issues),
            "issueReasons": dict(sorted(Counter(issue["reason"] for issue in issues).items())),
            "blocksWithIssues": sum(bool(block["issues"]) for block in blocks), "perBlockBudget": budget},
        "runtimeCoverage": {"measured": False, "complete": False, "sourceBankJoinsAdded": 0, "registryChanged": False},
        "limitations": ["Archive inventory is 22 pinned local-copy blocks, not a scene/runtime coverage denominator.",
            "Sites are conservative static candidates from all five header entries; predicates and call/return feasibility are unsolved.",
            "Ordinary numeric nonlocal GOTO records an issue and retains the VM continuation; ON_GOTO also retains fallthrough.",
            "Unknown/truncated framing, overlap, invalid entries/targets, dynamic pictures and budget limits remain explicit.",
            "Engine reachability.ts still omits ON_GOTO fallthrough; no engine/runtime code is changed here.",
            "NEWECL chains, host CALL effects and campaign feasibility are not evaluated.",
            "Numeric PICTURE IDs never infer PIC/BIGPIC bank, asset identity, consumer link, animation or Restyle admission.",
            "Receipt includes hashes/offsets/branch metadata only; source archives, dialogue, raw code and registry are not written."]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-receipt", action="store_true", help="write only the fixed metadata receipt, never the registry")
    args = parser.parse_args()
    result = build_census()
    if args.write_receipt:
        scanner.atomic_json(RECEIPT, result)
    print(json.dumps({"inventory": result["inventoryCoverage"], "staticFindings": result["staticSummary"],
                      "runtimeCoverage": result["runtimeCoverage"], "writeReceipt": args.write_receipt}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
