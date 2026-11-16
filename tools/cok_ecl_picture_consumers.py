#!/usr/bin/env python3
"""Source-only CoK ECL1#16 PICTURE register; never executes a game/VM or admits art."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import tempfile
from collections import deque
from pathlib import Path
from typing import Any

import dax_decode
import gen1_ecl_encounter_scan as ecl
import graphics_asset_registry
from dqk_ca03_stream_decode import decode_ecl_string
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
RECEIPT = "docs/engine/research/cok-ecl1-16-picture-sites-2026-11-03.json"
ASSET_ID = "cok/dos-ega/disk1/bigpic1.dax/block/114/frame/0"
ECL_SHA = "6387021ed8c84f2834d32d7c5e66dd03b88322d0c5072cba6cfb64a48e9ccf79"
ECL_BLOCK_SHA = "826dd124d05280ab588e94d6bf6c6c4994fdc99acf250d6ae5aa1d304fff4537"
BIGPIC_SHA = "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec"
BIGPIC_BLOCK_SHA = "7ff458d604556e54a5b430c37364a2f766421d73d0c3087378445e58bd8b3e73"
RGB_SHA = "a790826925a8de9fed65f705442ea429e1d230d14793c00939e2237830eda9f9"
PNG_SHA = "14b73d78b3758a083aa94dfcc5388b58c8debeac64e273d18187f3f9fff32d7e"
PIC_SHA = "2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97"
HOST_FRAGMENTS = [
    ("apps/web/src/ui/explore.ts", "async function cokDialoguePictures(", "\nasync function cokThrotlPresentation(", "8f9ccd9ca3f880d7143bcd128720bc1a94cbf021063c54644ed91314e83320f2"),
    ("apps/web/src/ui/explore.ts", "async function openCokTravel(", "    const travelMonsterLookup", "5e5764a7dd7189d3298586e968474feca28c253fe39fa7e6ff1ae529cbe7eeae"),
    ("apps/web/src/ui/dialogue.ts", "function selectPresentationPicture(", "\nfunction wrapDialogueText(", "9fa023dba4194c2efa39bd543e1da0f59b40619f865420ee14b939c1794feaee"),
    ("apps/web/src/ui/dialogue.ts", "  let viewport = null;", "  const selectedMode", "4c24bbf2de9d968a601e9c4d716dfc95a9e36cc89586adda08def7c29557f2f1"),
]


def instruction_record(raw: bytes, ins) -> dict[str, Any]:
    result = {"offset": ins.offset, "vaddr": ins.offset + 0x7FFE, "mnemonic": ins.mnemonic,
              "operands": [operand.evidence() for operand in ins.args]}
    strings, string_pins, pos = [], [], ins.offset + 1
    for operand in ins.args:
        start = pos
        _value, pos = ecl.read_operand(raw, pos)
        if operand.code == 0x80:
            text = decode_ecl_string(raw[start+2:pos])
            string_pins.append({"operandOffset": start, "packedBytes": pos - start - 2,
                                "packedSha256": sha(raw[start+2:pos])})
            # The receipt is metadata, not an extracted dialogue/code archive.
            if text == "WILD":
                strings.append(text)
    if strings:
        result["inlineStrings"] = strings
    if string_pins:
        result["inlineStringPins"] = string_pins
    return result


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def scan_picture_sites(raw: bytes, budget: int = 50000) -> dict[str, Any]:
    if len(raw) < 22 or raw[:2] != b"\x88\x13":
        raise ValueError("ECL header magic/length differs")
    work = deque()
    entries, issues, decoded, owners, seen, sites, dispatches = [], [], {}, {}, set(), {}, {}
    for slot, name in enumerate(ecl.ENTRY_NAMES):
        base = 2 + slot * 4
        segment, address = int.from_bytes(raw[base:base+2], "little"), int.from_bytes(raw[base+2:base+4], "little")
        offset = address - 0x7FFE
        entries.append({"entry": name, "segment": segment, "vaddr": address, "offset": offset})
        if segment != 0x0101 or not 22 <= offset < len(raw):
            issues.append({"entry": name, "offset": offset, "reason": "invalid-header-entry"})
        else:
            work.append((offset, name, []))

    def issue(offset, entry, reason, path):
        issues.append({"entry": entry, "offset": offset, "reason": reason, "path": path})

    while work:
        if len(seen) >= budget:
            issues.append({"reason": "budget-exhausted", "pending": len(work)})
            break
        offset, entry, path = work.popleft()
        if (offset, entry) in seen:
            continue
        seen.add((offset, entry))
        if not 22 <= offset < len(raw):
            issue(offset, entry, "nonlocal-target", path); continue
        ins = decoded.get(offset)
        if ins is None:
            if offset in owners and owners[offset] != offset:
                issue(offset, entry, "overlap-mid-instruction", path); continue
            ins = ecl.decode_one(raw, offset, ecl.GEN1_WORD_SETS, ecl.opcodes_for_profile("champions-of-krynn"))
            if ins is None:
                issue(offset, entry, "unknown-or-truncated-instruction", path); continue
            if any(byte in owners and owners[byte] != offset for byte in range(offset, offset + ins.size)):
                issue(offset, entry, "overlapping-instruction", path); continue
            decoded[offset] = ins
            for byte in range(offset, offset + ins.size):
                owners[byte] = offset
        trace = path + [instruction_record(raw, ins)]
        next_offset = offset + ins.size
        if ins.opcode == 0x0E:
            operand = ins.args[0]
            record = sites.setdefault(offset, {"offset": offset, "vaddr": offset + 0x7FFE,
                "operand": operand.evidence(), "pictureId": operand.word if operand.code == 0 else None,
                "entries": [], "paths": []})
            record["entries"].append(entry); record["paths"].append({"entry": entry, "steps": trace})
            if operand.code != 0:
                issue(offset, entry, "dynamic-picture-operand", trace)
        if ins.opcode in (0x25, 0x26):
            dispatches[offset] = {"offset": offset, "vaddr": offset + 0x7FFE, "mnemonic": ins.mnemonic,
                "operands": [operand.evidence() for operand in ins.args], "fallthroughRetained": True}

        def push(target, label):
            work.append((target, entry, trace + [{"edge": label}]))

        def target(operand, label):
            # Branch address forms 0/1/2/3 are the existing CoK dialect's local targets.
            result = ecl.target_offset(operand, 0x8000)
            if result is None:
                issue(offset, entry, "unresolved-branch-target", trace)
            else:
                push(result, label)

        if ins.opcode in (0x00, 0x13, 0x20):
            continue
        if 0x16 <= ins.opcode <= 0x1B:
            push(next_offset, "IF-taken")
            guarded = ecl.decode_one(raw, next_offset, ecl.GEN1_WORD_SETS, ecl.opcodes_for_profile("champions-of-krynn"))
            if guarded is None:
                issue(next_offset, entry, "truncated-IF-guard", trace)
            else:
                push(next_offset + guarded.size, "IF-not-taken")
        elif ins.opcode in (0x01, 0x02):
            target(ins.args[0], "GOSUB-target" if ins.opcode == 0x02 else "GOTO-target")
            if ins.opcode == 0x02:
                push(next_offset, "GOSUB-conservative-continuation")
            elif (ecl.target_offset(ins.args[0], 0x8000) is None
                  or not 22 <= ecl.target_offset(ins.args[0], 0x8000) < len(raw)):
                # VM ordinary numeric nonlocal GOTO also continues at the operand end.
                # The target still enters the queue above, retaining its explicit issue.
                push(next_offset, "nonlocal-GOTO-fallthrough")
        elif ins.opcode in (0x25, 0x26):
            for index, operand in enumerate(ins.args[2:]):
                target(operand, f"{ins.mnemonic}-target-{index}")
            push(next_offset, f"{ins.mnemonic}-out-of-range/nonlocal-fallthrough")
        else:
            push(next_offset, "fallthrough")
    return {"entries": entries, "pictureSites": [sites[key] for key in sorted(sites)],
        "dispatchSites": [dispatches[key] for key in sorted(dispatches)], "issues": issues,
        "instructionCount": len(decoded), "expandedEntryStates": len(seen),
        "complete": False, "claim": "Conservative static site candidates, not a campaign/runtime denominator.",
        "limitations": ["IF outcomes are both retained; comparisons/memory conditions are not solved.",
            "GOSUB continuation is conservative; call/return feasibility is not proven.",
            "Engine reachability.ts omits ON_GOTO fallthrough; this register retains the VM's fallthrough.",
            "NEWECL chains, host CALL effects and runtime/campaign reachability are outside this block register."]}


def pinned_block(path: Path, archive_pin: str, block_id: int, block_pin: str) -> tuple[bytes, dict[str, Any]]:
    data = path.read_bytes()
    if sha(data) != archive_pin:
        raise ValueError(f"{path}: archive SHA differs")
    base, blocks = dax_decode.parse_container(data)
    hits = [block for block in blocks if block.block_id == block_id]
    if len(hits) != 1:
        raise ValueError(f"{path}: block locator is absent or ambiguous")
    block = hits[0]
    raw = dax_decode.decompress_block(data, base, block)
    if len(raw) != block.raw_size or sha(raw) != block_pin:
        raise ValueError(f"{path}: decompressed block SHA/length differs")
    return raw, {"archiveSha256": sha(data), "blockId": block_id, "blockSha256": sha(raw),
        "rawBytes": len(raw), "compressedFileOffset": base + block.data_offset, "compressedBytes": block.comp_size}


def verify_asset_114(asset: dict[str, Any]) -> None:
    if (asset.get("id") != ASSET_ID or asset.get("game") != "cok" or asset.get("platform") != "DOS-EGA"
            or asset.get("archive", {}).get("name") != "BIGPIC1.DAX"
            or asset.get("archive", {}).get("sha256") != BIGPIC_SHA
            or asset.get("locator") != {"kind": "block-frame", "blockId": 114, "frameIndex": 0, "tileIndex": None, "cellIndex": None}):
        raise ValueError("PICTURE 114 source-qualified archive/locator differs")
    decoded = asset.get("decoded") or {}
    if any(decoded.get(key) != value for key, value in {"sha256": PNG_SHA, "pixelSha256": RGB_SHA, "width": 304, "height": 120}.items()):
        raise ValueError("PICTURE 114 decoded source pin/geometry differs")


def consumer_114(receipt: dict[str, Any]) -> dict[str, Any]:
    verify_receipt(receipt)
    site = receipt["caravanJoin"]["pictureSite"]
    if site["pictureId"] != 114 or site["operand"] != {"kind": "immediate", "code": 0, "value": 114}:
        raise ValueError("PICTURE 114 emitted operand differs")
    return {"status": "verified", "use": f"Source-qualified CoK ECL1#16 caravan PICTURE 114 site at decompressed offset {site['offset']} / vaddr 0x{site['vaddr']:04x} resolves through openCokTravel/cokDialoguePictures to DOS BIGPIC1.DAX#114/frame0. Static caller/source binding is verified; campaign conditions, complete scene denominator and Restyle/runtime admission remain unproven.",
        "evidence": [{"kind": "research-doc", "reference": RECEIPT,
            "note": f"ECL archive {ECL_SHA}; block16 {ECL_BLOCK_SHA}; BIGPIC archive {BIGPIC_SHA}; block114 {BIGPIC_BLOCK_SHA}; native RGB {RGB_SHA}. All five header entries and conservative IF/ON_GOTO paths are retained. No new runtime observation or art admission."}]}


def apply_consumer_114(registry: dict[str, Any], receipt: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(registry)
    hits = [asset for asset in result["assets"] if asset["id"] == ASSET_ID]
    if len(hits) != 1:
        raise ValueError("PICTURE 114 registry source ID is absent or ambiguous")
    asset = hits[0]; verify_asset_114(asset)
    verified = consumer_114(receipt)
    records = asset["gameConsumers"]
    for record in records:
        if any(e.get("reference") == RECEIPT for e in record.get("evidence", [])) or record.get("use", "").startswith("Source audit associates this block with the caravan"):
            evidence = list(record.get("evidence", []))
            for item in verified["evidence"]:
                if item not in evidence:
                    evidence.append(item)
            record.update({**verified, "evidence": evidence})
            break
    else:
        records.append(verified)
    return result


def atomic_json(path: Path, value: dict[str, Any], validate_registry: bool = False) -> None:
    if validate_registry:
        errors, _warnings = graphics_asset_registry.validate(value)
        if errors:
            raise ValueError("Registry validation failed: " + "; ".join(errors))
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=path.parent,
                                         prefix=f".{path.name}.", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n"); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def compressed_origin(data: bytes, start: int, size: int, raw_offset: int) -> dict[str, Any]:
    pos, expanded = start, 0
    while pos < start + size:
        control = pos; byte = data[pos]; pos += 1
        count = byte + 1 if byte < 128 else 256 - byte
        if expanded <= raw_offset < expanded + count:
            return {"kind": "literal" if byte < 128 else "repeat", "controlFileOffset": control,
                    "valueFileOffset": pos + raw_offset - expanded if byte < 128 else pos}
        pos += count if byte < 128 else 1
        expanded += count
    raise ValueError("Decompressed opcode has no compressed origin")


def verify_receipt(receipt: dict[str, Any]) -> None:
    join = receipt.get("caravanJoin", {})
    site, source, ecl_source = join.get("pictureSite", {}), join.get("source", {}), receipt.get("ecl", {})
    if (receipt.get("schema") != "cok-ecl-picture-sites-v1" or ecl_source.get("archiveSha256") != ECL_SHA
            or ecl_source.get("blockId") != 16 or ecl_source.get("blockSha256") != ECL_BLOCK_SHA
            or join.get("sourceAssetId") != ASSET_ID or site.get("offset") != 1376 or site.get("vaddr") != 0x855E
            or site.get("pictureId") != 114 or site.get("operand") != {"kind": "immediate", "code": 0, "value": 114}
            or source.get("archive") != "BIGPIC1.DAX" or source.get("archiveSha256") != BIGPIC_SHA
            or source.get("blockId") != 114 or source.get("blockSha256") != BIGPIC_BLOCK_SHA
            or source.get("pixelSha256") != RGB_SHA or source.get("pngSha256") != PNG_SHA
            or source.get("geometry") != [304, 120, 0, 0]
            or join.get("caravanTextContext", {}).get("marker") != "CARAVAN UNDER"
            or join.get("caravanTextContext", {}).get("instruction", {}).get("offset") != 1379
            or [row.get("sha256") for row in receipt.get("hostSource", [])] != [row[3] for row in HOST_FRAGMENTS]):
        raise ValueError("Caravan receipt source/host/PICTURE 114 pin differs")


def build_receipt(root: Path = ROOT, dos_root: Path | None = None,
                  png: Path = Path("C:/GoldBoxImg/cok_restyle_work/dos_render_all/BIGPIC1/BIGPIC1_114.png")) -> dict[str, Any]:
    dos_root = dos_root or root / "Champions of Krynn"
    raw, archive = pinned_block(dos_root / "ECL1.DAX", ECL_SHA, 16, ECL_BLOCK_SHA)
    report = scan_picture_sites(raw)
    sites = [site for site in report["pictureSites"] if site["pictureId"] == 114]
    if len(sites) != 1 or sites[0]["offset"] != 1376 or sites[0]["vaddr"] != 0x855E:
        raise ValueError("Pinned caravan PICTURE 114 site differs")
    site = sites[0]
    site["compressedOpcodeOrigin"] = compressed_origin((dos_root / "ECL1.DAX").read_bytes(), archive["compressedFileOffset"], archive["compressedBytes"], site["offset"])
    # The exact source path must carry WILD and the caravan memory guard; neither is solved here.
    path = site["paths"][0]["steps"]
    dispatch = [step for step in path if step.get("offset") in (717, 726, 727, 1365, 1371)]
    if not any(step.get("inlineStrings") == ["WILD"] for step in dispatch):
        raise ValueError("Caravan WILD dispatch source differs")
    following = ecl.decode_one(raw, 1379, ecl.GEN1_WORD_SETS, ecl.opcodes_for_profile("champions-of-krynn"))
    if following is None or following.mnemonic != "PRINTCLEAR" or "CARAVAN UNDER" not in decode_ecl_string(raw[1382:1415]):
        raise ValueError("Caravan adjacent printed context differs")
    image, bigpic = pinned_block(dos_root / "BIGPIC1.DAX", BIGPIC_SHA, 114, BIGPIC_BLOCK_SHA)
    geometry = dax_decode.parse_standard_frame(image)
    if geometry != (304, 120, 0, 0):
        raise ValueError("Caravan source geometry differs")
    rgb = bytes(dax_decode.frame_to_rgb(image, 304, 120, dax_decode.FRAME_HEADER))
    if sha(rgb) != RGB_SHA or sha(png.read_bytes()) != PNG_SHA:
        raise ValueError("Caravan decoded pixels/source PNG differ")
    with Image.open(png) as rendered:
        expected = Image.frombytes("RGB", (304, 120), rgb).resize((1216, 480), Image.Resampling.NEAREST)
        if rendered.size != expected.size or rendered.convert("RGB").tobytes() != expected.tobytes():
            raise ValueError("Caravan full nearest-neighbor source render differs")
    pic = (dos_root / "PIC1.DAX").read_bytes()
    if sha(pic) != PIC_SHA or any(block.block_id == 114 for block in dax_decode.parse_container(pic)[1]):
        raise ValueError("Later-loaded PIC1 bank pin or no-114 collision proof differs")
    host = []
    for filename, start, end, pin in HOST_FRAGMENTS:
        text = (root / filename).read_text(encoding="utf-8")
        if text.count(start) != 1:
            raise ValueError(f"Host source symbol is absent or ambiguous: {start}")
        begin = text.index(start); finish = text.index(end, begin)
        digest = sha(text[begin:finish].encode())
        if digest != pin:
            raise ValueError(f"Host source fragment SHA differs: {start}")
        host.append({"path": filename, "startSymbol": start, "endSymbol": end, "sha256": digest})
    receipt = {"schema": "cok-ecl-picture-sites-v1", "task": "SCENE-ROUTES-114", "ecl": {"archive": "ECL1.DAX", **archive},
        "register": report, "hostSource": host,
        "caravanJoin": {"sourceAssetId": ASSET_ID, "pictureSite": site, "controllingWildSites": dispatch,
            "caravanTextContext": {"marker": "CARAVAN UNDER", "instruction": instruction_record(raw, following)},
            "source": {"archive": "BIGPIC1.DAX", **bigpic, "geometry": list(geometry), "pixelSha256": sha(rgb), "pngSha256": PNG_SHA},
            "laterBankCollisionProof": {"archive": "PIC1.DAX", "archiveSha256": PIC_SHA, "hasBlock114": False},
            "hostBinding": "openCokTravel loads ECL1/BIGPIC1/PIC1; cokDialoguePictures retains each decoded frame's source identity. PIC1 has no 114 collision. selectPresentationPicture resolves the event through those maps; width304 uses the big-picture compositor at (8,8).",
            "existingAcceptanceDefinition": "apps/web/test/e2e.mjs runCokRetailTravel: cursor (1,3)->(2,3), CARAVAN UNDER ATTACK, combat and aftermath. Not run in this source-only slice.",
            "runtimeAdmission": "not-admitted", "campaignReachability": "not established by conservative static paths"}}
    verify_receipt(receipt)
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write only metadata receipt and the one validated registry consumer update")
    args = parser.parse_args()
    receipt = build_receipt()
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    updated = apply_consumer_114(registry, receipt)
    errors, warnings = graphics_asset_registry.validate(updated)
    if errors:
        raise ValueError("Registry validation failed: " + "; ".join(errors))
    if args.write:
        atomic_json(ROOT / RECEIPT, receipt)
        atomic_json(REGISTRY, updated, validate_registry=True)
    print(json.dumps({"pictureSites": len(receipt["register"]["pictureSites"]),
        "instructions": receipt["register"]["instructionCount"], "issues": len(receipt["register"]["issues"]),
        "complete": False, "registryChanged": updated != registry, "validationErrors": len(errors),
        "validationWarnings": len(warnings), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
