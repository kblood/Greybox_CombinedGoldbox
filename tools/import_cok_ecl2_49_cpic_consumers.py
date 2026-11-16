#!/usr/bin/env python3
"""Derive the bounded DOS CoK ECL2#49 CPIC consumer association from pinned data."""

from __future__ import annotations

import argparse
import copy
import io
import json
import re
from pathlib import Path
from typing import Any

from PIL import Image

import dax_decode
import find_geo_path
import gen1_ecl_encounter_scan as scanner
from cok_ecl_picture_census import strict_rle
from goldbox_corpus import decode_record_name
from graphics_asset_registry import validate
from import_cok_dos_cpic_registry import NATURAL_CPIC_IDS, NATURAL_ROUTE_USE_PREFIX, correct_ecl2_49_seed_claim, identity_id
from import_cok_ecl_picture_consumers import REGISTRY_DEFAULT as REGISTRY
from import_cok_ecl_picture_consumers import ROOT, _atomic_write, sha256


TASK = "COK-ECL2-49-NATURAL-CPIC-JOIN"
DOS_FOLDER = "Champions of Krynn"
RECEIPT_REF = "docs/engine/research/cok-ecl2-49-cpic-consumers-v1.json"
RECEIPT = ROOT / RECEIPT_REF
PREVIEW_REF = "apps/web/dist-app-cok57/restyle/cok-generated"
PROFILE = "champions-of-krynn"
CLAIM_LIMIT = "Source-linked to the existing route golden. Depicted subject, visible icons, new runtime observations and Restyle admission remain unestablished by this slice."

# Archive SHA, ordered TOC, and selected entries (block ID, entry index, relative offset,
# compressed length, decompressed length, decompressed SHA-256).
ARCHIVES = {
    "ECL2.DAX": (
        "4f4ba999b0d46817091e82fe5ccf27cb6eee95cd833389353d7285c2a8dccbea",
        (48, 49, 50, 57, 64, 66, 67, 68),
        ((49, 1, 7657, 7114, 6956, "58640ee7c75ca1cba9a98c6b1eebe3cf9963440b5957f51a92041e602aa49b9c"),),
    ),
    "GEO2.DAX": (
        "8030dd8b50828cbdb0e53fa32e75a4f9d56778a21618cd44c650c5a2bd61af05",
        (48, 49, 50, 64, 66, 67, 68),
        ((49, 1, 985, 860, 1026, "a3e2767e05644fab3cdf3d4e6ab951535ce9cf935e2bf00cda3884c6a4c27308"),),
    ),
    "MON2CHA.DAX": (
        "b6034b1accae8964d724c033f99a8b7c95c370a31c9f5ac7329e47604d5008df",
        (1, 2, 5, 6, 7, 8, 14, 19, 27, 31, 36, 39, 42, 44, 46, 49,
         52, 54, 60, 61, 62, 4, 10, 17, 23, 25, 28, 33, 37, 40, 55, 56),
        (
            (1, 0, 0, 92, 409, "3933e926b3281c75c2d19bae0297929ba0a2fd24f0b72b2a51b0906c881bf606"),
            (14, 6, 540, 92, 409, "3f3678579bcf090d5704dd546bf7f63b70ff5125cbe815e7894806c85820996c"),
        ),
    ),
    "CPIC2.DAX": (
        "7925da2db12a4e42ffc2df737fce830fddede11ae9d350e61a9a53f2950b94e4",
        (129, 1, 130, 2, 132, 4, 133, 5, 134, 6, 136, 8, 138, 10, 140, 12, 141, 13, 142, 14,
         145, 17, 147, 19, 151, 23, 153, 25, 154, 26, 155, 27, 156, 28, 159, 31, 161, 33, 163, 35,
         166, 38, 169, 41, 173, 45, 176, 48, 179, 51, 182, 54, 184, 56, 188, 60, 189, 61, 190, 62),
        (
            (1, 1, 252, 272, 305, "39ea39fa52c4d9f07f757ae04113064d3856bdfce9a243e36fe4d689bbd35a00"),
            (14, 19, 5974, 307, 305, "581fbf41fe4c5744e30fecb18043e893b62b7240b4a646231d62f10db6fb449b"),
        ),
    ),
}
FRAMES = {
    1: ("c3fdd8c7d4c31397b55c709ecf1cb5fde88da0d185266e065c67ce58ad697fff",
        "fc604d4757fa4209bc31349c34405993ef78b5e373a8ed3516567a4f2820836a"),
    14: ("d60817503a1a7201d891dc29bf4707b1147b89ac857d15bba8ccaf89683a6c3c",
         "1f08c680bd8af1e7c0646d4af8e8384ffb26ae13aa671106b13002c47cf79c27"),
}
COMBAT = 0x9220
SCAN_ROSTER = [(1, 5, 1), (14, 4, 14)]
COMBAT_SITE = "ECL2.DAX#49 COMBAT@0x9220"
SITE_PATTERN = r"ECL2\.DAX#\d+ COMBAT@0x[0-9A-F]{4}"

EXPLORE = "apps/web/src/ui/explore.ts"
COMBAT_UI = "apps/web/src/ui/combat.ts"
VM = "packages/engine/src/ecl/vm.ts"
HOST = (
    ("profile", "apps/web/src/ui/gameData.ts", "  'cok-natural-2': {", "  'cok-natural-3': {",
     "6a00f61d2dca85fbd2c91d70ac19061bb2c1447cbe39b6f131d093c2cd2475d2"),
    ("spawn", EXPLORE, "function chooseStart(", "\n/** Current party pose",
     "a659c78042316679c63b6a9f1728a3d126e0e34ebb64dcba0996d7a7eb589fdb"),
    ("cellDispatch", EXPLORE, "function runStepEvent(", "\n/**\n * Pool's wilderness/overland crossing",
     "c20d43296be7029eef5ba886321cec4de8dd22b17847b8fe312bc9bd6d7a5a19"),
    ("searchLocation", "packages/engine/src/world/dungeonEvents.ts", "export function primeSearchLocation(",
     "\n/**\n * Position a VM at `block`'s **vmRun1**", "5064110480ee9cf8fb17a5d83abc69b4788b87543713c46da1ef94b84c62104c"),
    ("loadMonster", VM, "      case 0x0b: {", "\n      case 0x1d:",
     "3b80f27f24e56b11bdbc8e49a3aa1eafdfdc8ae35d0167237ea2ae04a90095b4"),
    ("diskBanks", EXPLORE, "const COK_CPIC_PATHS:", "\n/**\n * Square-pixel variant",
     "2a885243ace10e825f803a297020d78581b2303f61b58c96be1524d886b39eaf"),
    ("activeDisk", EXPLORE, "function combatBackdropPaths(", "\nfunction persistGraphicsMode(",
     "817d50c2cea04442f13445104dc7818768838ad1cb3cffaba8a24063a0b765d5"),
    ("enemyMap", EXPLORE, "function combatantPictureIdsFor(", "\nfunction setStatus(",
     "50a2f93b0c3ad65c5f1635d80e830cbc5ef6c74872bc0a7d21b9b9be2c22cdf1"),
    ("combatLaunch", EXPLORE, "function resolveCombat(", "    onEnd: (res) => {",
     "aa530756f1ac92880f17255ac9d4e9bc7a2f14c5b50994de5887028f77958796"),
    ("decodeIcon", COMBAT_UI, "function iconLibraryFrom(", "\n/** Load combat assets",
     "8b5600da2534bacfa2a7da11fd06aaca6f4c21a8a798f7ac004cc81e7a3dc7e7"),
    ("lookupIcon", COMBAT_UI, "  for (const [combatantId, pictureId] of cfg.combatantPictureIds ?? []) {",
     "  const playerPreparations", "0d8c37b35526c7a35e7bf009a90915ea07c541a46118c0137e9c66116e5c3c60"),
    ("engineGolden", "packages/engine/test/dungeonEvents.test.ts", "const ecl2 = resolve(",
     "// --- investigation: DoK ECL1/GEO1 block 33", "2740e091f2f910a6c378492c0fc65ea5d5aee1faeea9c34604e4781a6d764e9b"),
    ("browserTest", "apps/web/test/e2e.mjs", "async function runExploreCok2NaturalCombat(",
     "        prefix: 'cok2-persistent'", "af72904302617da0f44bff5a0ec8939017eb63cfb9f2b9002816e701bc9a5df6"),
)


def verify_host(texts: dict[str, str]) -> list[dict[str, Any]]:
    result = []
    for role, path, start, end, digest in HOST:
        text = texts[path].replace("\r\n", "\n")
        if text.count(start) != 1:
            raise ValueError(f"{role}: host source boundary missing or ambiguous")
        begin = text.index(start)
        finish = text.find(end, begin + len(start))
        if finish < 0 or sha256(text[begin:finish].encode()) != digest:
            raise ValueError(f"{role}: host source SHA-256 differs")
        result.append({"role": role, "path": path, "start": start, "endExclusive": end, "sha256": digest})
    return result


def read_archive(name: str, data: bytes) -> tuple[dict[int, bytes], dict[str, Any]]:
    digest, expected_toc, entries = ARCHIVES[name]
    if sha256(data) != digest:
        raise ValueError(f"{name}: archive SHA-256 differs")
    base, toc = dax_decode.parse_container(data)
    if tuple(row.block_id for row in toc) != expected_toc:
        raise ValueError(f"{name}: ordered TOC differs")
    blocks, evidence = {}, []
    for block, index, offset, compressed, size, raw_sha in entries:
        row = toc[index]
        if (row.block_id, row.data_offset, row.comp_size, row.raw_size) != (block, offset, compressed, size):
            raise ValueError(f"{name}#{block}: exact TOC entry differs")
        start = base + offset
        if start + compressed > len(data):
            raise ValueError(f"{name}#{block}: compressed range exceeds archive")
        raw = strict_rle(data[start:start + compressed], size)
        if sha256(raw) != raw_sha:
            raise ValueError(f"{name}#{block}: raw block SHA-256 differs")
        blocks[block] = raw
        evidence.append({"blockId": block, "entryIndex": index, "dataOffset": offset,
                         "compressedBytes": compressed, "rawBytes": size, "blockSha256": raw_sha})
    return blocks, {
        "path": f"{DOS_FOLDER}/{name}", "sha256": digest, "byteLength": len(data), "dataBase": base,
        "orderedTocBlockIds": list(expected_toc), "blocks": evidence,
    }


def ecl_route(raw: bytes) -> dict[str, Any]:
    addend = scanner.PROFILE_ADDRESS_ADDENDS.get(PROFILE, scanner.DEFAULT_ADDRESS_ADDEND)
    word_sets, opcodes = scanner.word_sets_for_profile(PROFILE), scanner.opcodes_for_profile(PROFILE)

    def decode(vaddr: int):
        return scanner.decode_one(raw, scanner.vaddr_to_offset(vaddr, addend), word_sets, opcodes)

    expected = {
        0x8220: ("AND", ((1, 0xC04F), (0, 63), (1, 0x7F79))),
        0x9161: ("AND", ((1, 0x4C6E), (0, 32), (1, 0x7F79))),
        0x916A: ("IF_NE", ()),
        0x916B: ("GOTO", ((1, 0x9221),)),
        0x916F: ("ADD", ((0, 32), (1, 0x4C6E), (1, 0x4C6E))),
        0x9211: ("CLEARMONSTERS", ()),
        0x9212: ("LOAD_MONSTER", ((0, 1), (0, 5), (0, 1))),
        0x9219: ("LOAD_MONSTER", ((0, 14), (0, 4), (0, 14))),
        COMBAT: ("COMBAT", ()),
    }
    sites = []
    for vaddr, pin in expected.items():
        ins = decode(vaddr)
        if ins is None or (ins.mnemonic, tuple((op.code, op.word) for op in ins.args)) != pin:
            raise ValueError(f"ECL2#49: instruction/operand pin differs at 0x{vaddr:04x}")
        sites.append({"offset": ins.offset, "vaddr": vaddr, "mnemonic": ins.mnemonic,
                      "operands": [op.evidence() for op in ins.args]})
    dispatch = decode(0x8229)
    if (dispatch is None or dispatch.mnemonic != "ON_GOTO" or len(dispatch.args) != 50
            or [(op.code, op.word) for op in dispatch.args[:2]] != [(1, 0x7F79), (0, 48)]
            or (dispatch.args[2 + 28].code, dispatch.args[2 + 28].word) != (1, 0x9161)):
        raise ValueError("ECL2#49: selector-28 dispatch pin differs")

    report = scanner.scan_block(raw, address_addend=addend, word_sets=word_sets, opcodes=opcodes)
    candidates = [row for row in report["candidates"] if row["combat_vaddr"] == COMBAT]
    if report["truncated_offsets"] or report["state_limit_reached"] or len(candidates) != 1:
        raise ValueError("ECL2#49: profile-aware scan failed or target candidate differs")
    candidate = candidates[0]
    expected_roster = [[{"code": 0, "kind": "immediate", "value": operand} for operand in group]
                       for group in SCAN_ROSTER]
    if (candidate["entry"], candidate["combat_offset"], candidate["roster"]) != ("search_location", 4642, expected_roster):
        raise ValueError("ECL2#49: COMBAT entry/roster differs")
    path = candidate["path_vaddrs"]
    relevant = [0x8220, 0x8229, 0x9161, 0x916A, 0x916F, 0x9211, 0x9212, 0x9219, COMBAT]
    if ([address for address in path if address in relevant] != relevant or 0x916B in path
            or "0x916a:condition-false" not in candidate["branch_decisions"]):
        raise ValueError("ECL2#49: selected path differs")
    return {
        "profile": PROFILE, "addressAddend": addend, "selector": {"value": 28, "mask": 63, "dispatchVaddr": 0x8229,
                                                                 "targetVaddr": 0x9161},
        "consumedBit": {"address": 0x4C6E, "mask": 0x20, "checkedBeforeCombat": True, "writeVaddr": 0x916F},
        "sites": sites, "scan": {key: value for key, value in report.items() if key != "candidates"},
        "candidate": candidate,
        "seedInterpretation": "The scanner flags conditional branches. The pinned existing engine golden enters with empty ECL memory and a deterministic PRNG seed.",
    }


def geo_route(raw: bytes) -> dict[str, Any]:
    if raw[:2] != b"\x00\x04":
        raise ValueError("GEO2#49: size-word header differs")
    cells = find_geo_path.decode_edges(raw)
    descriptor = find_geo_path.decode_descriptors(raw, 63)
    if [index for index, value in enumerate(descriptor) if value == 28] != [166] or raw[514 + 166] != 0x9C:
        raise ValueError("GEO2#49: exact selector-28 cell differs")
    # Match the pinned chooseStart helper: row-major first cell with most open edges,
    # then the first open direction in NESW order.
    index = max(range(len(cells)), key=lambda i: sum(wall == 0 for wall, _ in cells[i].values()))
    start = (index % 16, index // 16)
    facing = next(direction for direction, (wall, _) in cells[index].items() if wall == 0)
    target = (6, 10)
    directions, coordinates = find_geo_path.find_path(cells, start, target)
    keys, end_facing = find_geo_path.dos_keys(directions, facing)
    if (start, facing, coordinates, keys, end_facing) != (
            (6, 9), "north", [(6, 9), (6, 10)], "{RIGHT}{RIGHT}{UP}", "south"):
        raise ValueError("GEO2#49: directed route differs")
    wall, door = cells[index]["south"]
    if (wall, door) != (0, 0):
        raise ValueError("GEO2#49: source south edge differs")
    return {"spawn": [6, 9, facing], "target": [6, 10, end_facing], "descriptorByteOffset": 514 + 166,
            "descriptor": raw[514 + 166], "selectorMask": 63, "selector": 28,
            "actions": ["right", "right", "forward"], "directedEdge": {"direction": "south", "wall": wall, "door": door}}


def verify_preview(data: bytes, rgb: bytes, digest: str) -> None:
    if sha256(data) != digest:
        raise ValueError("CPIC preview SHA-256 differs")
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "PNG" or image.size != (96, 96):
            raise ValueError("CPIC preview is not a 96x96 PNG")
        expected = Image.frombytes("RGB", (24, 24), rgb).resize((96, 96), Image.Resampling.NEAREST)
        if expected.tobytes() != image.convert("RGB").tobytes():
            raise ValueError("CPIC preview pixels differ from exact 4x native RGB")


def cpic_frame(raw: bytes, block: int, preview_root: Path) -> dict[str, Any]:
    pixel_sha, preview_sha = FRAMES[block]
    if dax_decode.parse_standard_frame(raw) != (24, 24, 0, 0):
        raise ValueError(f"CPIC2#{block}: expected native 24x24 zero-offset frame")
    rgb = dax_decode.frame_to_rgb(raw, 24, 24, dax_decode.FRAME_HEADER)
    if sha256(rgb) != pixel_sha:
        raise ValueError(f"CPIC2#{block}: native RGB SHA-256 differs")
    preview_path = f"images/{preview_sha}.png"
    verify_preview((preview_root / preview_path).read_bytes(), rgb, preview_sha)
    return {"sourceAssetId": identity_id("CPIC2", block), "pictureId": block, "frameIndex": 0,
            "nativeGeometry": [24, 24, 0, 0], "nativeRgbSha256": pixel_sha,
            "preview": {"path": preview_path, "sha256": preview_sha, "width": 96, "height": 96, "nearestScale": 4}}


def build_receipt(root: Path = ROOT, preview_root: Path | None = None) -> dict[str, Any]:
    preview_root = preview_root if preview_root is not None else root / PREVIEW_REF
    host = verify_host({path: (root / path).read_text(encoding="utf-8") for path in {row[1] for row in HOST}})
    archives, blocks = {}, {}
    for name in ARCHIVES:
        blocks[name], archives[name] = read_archive(name, (root / DOS_FOLDER / name).read_bytes())
    ecl = ecl_route(blocks["ECL2.DAX"][49])
    geo = geo_route(blocks["GEO2.DAX"][49])
    roster, tactical = [], {}
    for group, name in zip(ecl["candidate"]["roster"], ("BAAZ", "KAPAK"), strict=True):
        monster, count, picture = (operand["value"] for operand in group)
        actual_name = decode_record_name(blocks["MON2CHA.DAX"][monster])
        if actual_name != name:
            raise ValueError(f"MON2CHA#{monster}: monster record name differs")
        frame = cpic_frame(blocks["CPIC2.DAX"][picture], picture, preview_root)
        roster.append({"monsterId": monster, "recordName": actual_name, "count": count, **frame})
        for _ in range(count):
            tactical[f"e{len(tactical)}"] = picture
    return {
        "schema": "cok-ecl2-49-cpic-consumers-v1", "task": TASK, "claimLimit": CLAIM_LIMIT, "runtimeObservations": 0,
        "archives": archives, "ecl": ecl, "geo": geo, "roster": roster,
        "tacticalSourceBinding": {"disk": 2, "archive": "CPIC2.DAX", "byCombatantSlot": tactical},
        "hostSource": {"hashInput": "UTF-8 LF-normalized fragments", "fragments": host},
        "priorTestEvidence": "The engine golden asserts the empty-memory encounter roster and eager consumed-bit write. The browser test source asserts the disk-2 icon archive, nine icon bindings and five plus four roster counts.",
        "previewEvidence": "Hash-pinned 96x96 source previews, compared at every RGB pixel with a 4x nearest-neighbor render of each native DAX frame.",
    }


def verify_registry_asset(asset: dict[str, Any], group: dict[str, Any]) -> None:
    archive, locator, preview = asset["archive"], asset["locator"], group["preview"]
    picture = group["pictureId"]
    if (asset["game"], asset["platform"], asset["identityStatus"], asset["id"]) != (
            "cok", "DOS-EGA", "source-pinned", group["sourceAssetId"]):
        raise ValueError("canonical DOS CPIC identity differs")
    if (archive["name"], archive["path"], archive["sha256"]) != (
            "CPIC2.DAX", f"{DOS_FOLDER}/CPIC2.DAX", ARCHIVES["CPIC2.DAX"][0]):
        raise ValueError("canonical CPIC archive pin differs")
    entry_index = next(row[1] for row in ARCHIVES["CPIC2.DAX"][2] if row[0] == picture)
    entry = locator.get("entryIndex")
    if (locator["kind"] != "block-frame" or type(locator["blockId"]) is not int or locator["blockId"] != picture
            or type(locator["frameIndex"]) is not int or locator["frameIndex"] != 0
            or (entry is not None and (type(entry) is not int or entry != entry_index))
            or locator.get("tileIndex") is not None or locator.get("cellIndex") is not None):
        raise ValueError("canonical CPIC block/frame or TOC locator differs")
    if any(asset["decoded"].get(key) != preview[key] for key in ("path", "sha256", "width", "height")):
        raise ValueError("canonical CPIC source preview pin differs")


def json_bytes(value: dict[str, Any], newline: bytes = b"\n") -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode().replace(b"\n", newline)


def merge_consumers(registry: dict[str, Any], receipt: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    merged = copy.deepcopy(registry)
    targets = {group["sourceAssetId"]: group for group in receipt["roster"]}
    ids = {asset["id"] for asset in merged["assets"]}
    if targets.keys() != NATURAL_CPIC_IDS or len(ids) != len(merged["assets"]) or not targets.keys() <= ids:
        raise ValueError("registry has duplicate IDs or the reviewed CPIC roster differs")
    digest = sha256(json_bytes(receipt))
    counts = {"added": 0, "updated": 0, "unchanged": 0}
    for asset in merged["assets"]:
        asset_id, consumers = asset["id"], asset["gameConsumers"]
        owned = [index for index, row in enumerate(consumers) if row["use"].startswith(NATURAL_ROUTE_USE_PREFIX)]
        if asset_id not in targets:
            if owned:
                raise ValueError("owned ECL2#49 CPIC evidence lies outside the reviewed roster")
            continue
        group = targets[asset_id]
        verify_registry_asset(asset, group)
        aggregates = [row for row in consumers if row["use"].startswith("Static ECL candidates select this picture ")]
        locations = set(re.findall(SITE_PATTERN, aggregates[0]["use"])) if len(aggregates) == 1 else set()
        if COMBAT_SITE not in locations or len(locations) != 17:
            raise ValueError(f"{asset_id}: expected one static aggregate with 17 candidate sites")
        correct_ecl2_49_seed_claim(asset)
        record = {
            "status": "partial",
            "use": f"{NATURAL_ROUTE_USE_PREFIX} ECL2#49 COMBAT@0x9220 queues "
                   f"{group['recordName']} (MON2CHA#{group['monsterId']}) ×{group['count']} "
                   f"with CPIC2.DAX#{group['pictureId']}/frame/0 in the disk-2 route. {CLAIM_LIMIT}",
            "evidence": [{
                "kind": "research-doc", "reference": f"{RECEIPT_REF}#roster",
                "note": f"Receipt SHA-256 {digest}. GEO2#49 selector 28 at (6,10), native RGB SHA-256 "
                        f"{group['nativeRgbSha256']}. Sixteen other candidate sites remain unresolved.",
            }],
        }
        if not owned:
            consumers.append(record)
            counts["added"] += 1
        elif len(owned) == 1 and consumers[owned[0]] == record:
            counts["unchanged"] += 1
        else:
            consumers[owned[0]] = record
            for index in reversed(owned[1:]):
                del consumers[index]
            counts["updated"] += 1
    return merged, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-root", type=Path, default=ROOT / PREVIEW_REF, help="root containing the pinned source previews")
    parser.add_argument("--write", action="store_true", help="atomically write the fixed receipt and registry files")
    args = parser.parse_args()
    receipt = build_receipt(ROOT, args.preview_root)
    derived = json_bytes(receipt)
    existing = RECEIPT.read_bytes() if RECEIPT.exists() else None
    if existing is not None and existing != derived:
        raise ValueError("existing ECL2#49 receipt differs from pinned derivation")
    original = REGISTRY.read_bytes()
    registry = json.loads(original)
    merged, counts = merge_consumers(registry, receipt)
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("registry validation failed: " + "; ".join(errors[:12]))
    if args.write:
        newline = b"\r\n" if b"\r\n" in original else b"\n"
        changed = merged != registry
        if changed and json_bytes(registry, newline) != original:
            raise ValueError("registry formatting differs from canonical serialization")
        if (RECEIPT.read_bytes() if RECEIPT.exists() else None) != existing or REGISTRY.read_bytes() != original:
            raise ValueError("receipt or registry changed during ECL2#49 derivation")
        if existing is None:
            _atomic_write(RECEIPT, derived)
        if changed:
            _atomic_write(REGISTRY, json_bytes(merged, newline))
    print(json.dumps({"runtimeObservations": 0, "receiptSha256": sha256(derived), "registryValidationWarnings": len(warnings),
                      "write": args.write, **counts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, OSError, TypeError, ValueError) as exc:
        raise SystemExit(f"ERROR: {exc}")
