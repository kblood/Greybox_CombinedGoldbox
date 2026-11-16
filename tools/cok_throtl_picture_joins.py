#!/usr/bin/env python3
"""Conditional source-only ECL1#17 -> existing DOS PIC1 frame0 evidence; no VM execution."""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from PIL import Image
import cok_ecl_picture_census as census
import cok_ecl_picture_consumers as source
import dax_complex_decode
import dax_decode

ROOT = Path(__file__).resolve().parents[1]
RECEIPT = "docs/engine/research/cok-throtl-picture-joins-2026-11-03.json"
SOURCE_ROOT = Path("C:/GoldBoxImg/cok_restyle_work")
PIC_SHA = "2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97"
BIGPIC_SHA = "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec"
ECL17_SHA = "94dabe74942985aab782c37df0d4ea38ae66b63a166e5251662d03998dc004cc"
PIC_TOC = [23,57,58,34,18,59,60,1,8,12,15,30,34,35,41,61,62,63]
BIGPIC_TOC = [114,121,112,115]
SITE_ROSTER = [(55,58),(1705,58),(2834,58),(6627,58),(212,57),(395,57),(586,57),(1296,57),(845,23),(5756,23),(7268,None)]
PINS = {
    23: {"rawBytes":31145,"frameCount":8,"blockSha256":"2a10157f1f46017a10c0053fd8fb101167e6a811441eacaf5952ca2a450333fa",
         "pixelSha256":"09b26589751f5511b51c0c975a86a9c9423ad3e7f487b297f24a4b450e94f1f8","pngSha256":"3858d73cd9a7920cfd0ef7a480ca481fc9ad70c2d4407774ba8873177c4fe010"},
    57: {"rawBytes":3894,"frameCount":1,"blockSha256":"e27c3c34f760d8cde8cf7f227c8dc21fdac3d919a94143fdb408d95075b5d5dc",
         "pixelSha256":"8c0a4838831c9d101721654ae0d39ded43c8aac9c304fae1101c73dbd20a4ca6","pngSha256":"f854debb99b65c412e49e90a7606263341e83bae5dca0ba8b5ba36d51d671191"},
    58: {"rawBytes":3894,"frameCount":1,"blockSha256":"c856b5763e14bed82ee1fedd687456d750ea0d234c9ed2fa8cda05e960b7d618",
         "pixelSha256":"6701a63e585efddea9d003a5be1b3143e192ab646f6c66d17f623bb7f65562e7","pngSha256":"ab274f539c435b02685a5b612360071906fa93294317846c0fe93e7022d67fc9"},
}
# Fresh fragment hashes measured from the current worktree, not inherited whole-file hashes.
HOST = [
 ("map","apps/web/src/ui/explore.ts","async function cokDialoguePictures(","\nasync function cokThrotlPresentation(","8f9ccd9ca3f880d7143bcd128720bc1a94cbf021063c54644ed91314e83320f2"),
 ("localPresentation","apps/web/src/ui/explore.ts","async function cokThrotlPresentation(","\nasync function openCokThrotlArrival(","a95984530a72ee41d00194f6ab6b4bf477519c8fb9d2573a2ed7e80d549050f6"),
 ("arrival","apps/web/src/ui/explore.ts","async function openCokThrotlArrival(","\nconst POOL_REGIONAL_START_BLOCK_ID","a7ec16fbf746050eae785d8fbd74acff8e2e3aab5cb51fd894a8fa10d470cfc3"),
 ("chain","apps/web/src/ui/explore.ts","async function remountCampaignChain(","  if (baseId === 'dok' && blockId === 17)","a08adef9fe6061e1bed0200f42f1013499ec77ca7955ea6ae9be2ca0b9eaff70"),
 ("travelMap","apps/web/src/ui/explore.ts","async function openCokTravel(","    const travelMonsterLookup","5e5764a7dd7189d3298586e968474feca28c253fe39fa7e6ff1ae529cbe7eeae"),
 ("travelCarry","apps/web/src/ui/explore.ts","        let returnToThrotl = false;","            void remountCampaignChain(blockId, context.memory, context, presentation);","1bc7196a6294a83d528e09f5e5cd596d4f5050e8994518e9277044a355eb5add"),
 ("vmPicture","packages/engine/src/ecl/vm.ts","      case 0x0e: // PICTURE id","\n      case 0x3d:","6016f7ee0b0822f5e4409469294f433cecae5718400ebda0b32f058c67846ecd"),
 ("lastPicture","packages/engine/src/world/dialogue.ts","function lastPicture(","\n/** The most recent prompt","486cbc30b14e20792c16b065170ad199bb94c4734dc54722d0d622ded717fe8f"),
 ("translate","packages/engine/src/world/dialogue.ts","  private translate(r: EclRunResult):","\n}\n\n/**\n * Page a dense retail","aa7fe6eca62b7c90ea959918a8c798f9276c46d73ff5766da548307b6461225c"),
 ("paginate","packages/engine/src/world/dialogue.ts","  private paginate(result: EclRunResult):","\n}\n\n/**\n * Build a dialogue runner","d47e8cecb8a51a6174839ed9017a87e880a748d9ce3d84c841ba0d96396ee7fc"),
 ("frame0","packages/engine/src/loaders/dax.ts","    // Multi-frame chunky-4bpp picture","    // Fixed-size multi-item tile array","d5c16a122b5bd33773c2f54923c9019376455eacee4662bb60f01efc6ac9de00"),
 ("select","apps/web/src/ui/dialogue.ts","function selectPresentationPicture(","\nfunction wrapDialogueText(","9fa023dba4194c2efa39bd543e1da0f59b40619f865420ee14b939c1794feaee"),
 ("surfaceGuard","apps/web/src/ui/dialogue.ts","function renderPresentation(turn: DialogueTurn):","  const pilot = selectedSceneArt(state);","5d871ae41dc8489438bb35a149681968a76132edd98de4765f31768e84254d40"),
 ("placement","apps/web/src/ui/dialogue.ts","  let viewport = null;","  const selectedMode","4c24bbf2de9d968a601e9c4d716dfc95a9e36cc89586adda08def7c29557f2f1"),
 ("surfaceMount","apps/web/src/ui/dialogue.ts","  if (opts.presentation) {","  const firstScene = opts.presentation?.sceneArt","b5d71fccf2b793a801217830ddb7ef1f93d6db1165280560cc2ce5fbd926c5c4"),
]


def asset_id(picture: int) -> str:
    return f"cok/dos-ega/disk1/pic1.dax/block/{picture}/frame/0"


def verify_map_contract(fragment: str, pic_toc: list[int], bigpic_toc: list[int]) -> None:
    compact = "".join(fragment.split())
    if "[[bigpicBytes,'BIGPIC1.DAX'],[picBytes,'PIC1.DAX']]" not in compact:
        raise ValueError("Loader map order differs")
    if "pictures.set(block.blockId,block.image)" not in compact or "frameIndex:0" not in compact:
        raise ValueError("Loader frame0 map contract differs")
    if pic_toc != PIC_TOC or bigpic_toc != BIGPIC_TOC:
        raise ValueError("Pinned image TOC/map collision contract differs")
    for picture in PINS:
        if pic_toc.count(picture) != 1 or picture in bigpic_toc:
            raise ValueError("PIC1 source locator missing/duplicate or wrong archive collision")


def verify_host_sources(texts: dict[str, str]) -> list[dict[str, str]]:
    result = []
    for role, path, start, end, pin in HOST:
        text = texts[path]
        if text.count(start) != 1:
            raise ValueError(f"Host symbol absent/ambiguous: {role}")
        begin = text.index(start); fragment = text[begin:text.index(end,begin)]
        if role == "map": verify_map_contract(fragment, PIC_TOC, BIGPIC_TOC)
        if role == "frame0" and ("blk.image = anim[0];" not in fragment or "frameSet.frames.set(blk.blockId, anim[0]);" not in fragment):
            raise ValueError("Decoded frame0 contract differs")
        if source.sha(fragment.encode()) != pin:
            raise ValueError(f"Current host fragment SHA differs: {role}")
        result.append({"role":role,"path":path,"startSymbol":start,"endSymbol":end,"sha256":pin})
    return result


def classify_binding(operand: dict[str, Any], origin: str, synthetic_memory=None) -> dict[str, Any]:
    # Memory is deliberately never evaluated by static source evidence.
    if operand.get("code") != 0:
        return {"status":"unresolved-dynamic", "sourceAssetId":None, "portraitOrigin":None}
    picture = operand.get("value")
    if picture not in PINS or origin not in ("local-throtl", "borrowed-travel"):
        return {"status":"unresolved-origin/source", "sourceAssetId":None, "portraitOrigin":None}
    return {"status":"conditional", "sourceAssetId":asset_id(picture),
            "portraitOrigin":{"value":[24,24],"condition":"Pinned native presentation, no portraitOrigin override, selected DOS original; source offsets zero."}}


def batch_summary(picture_effects: list[int]) -> dict[str, Any]:
    return {"pictureEffects":list(picture_effects), "lastPictureRegister":picture_effects[-1] if picture_effects else None,
            "sceneCount":None,"pauseVisibility":"unresolved; NarrativeDialogueMachine may split at PRINT boundaries"}


def decode_sources(pic_data: bytes, bigpic_data: bytes, source_root: Path) -> list[dict[str, Any]]:
    if source.sha(pic_data) != PIC_SHA or source.sha(bigpic_data) != BIGPIC_SHA:
        raise ValueError("PIC1/BIGPIC1 archive SHA differs")
    base, blocks = dax_decode.parse_container(pic_data)
    pic_toc = [block.block_id for block in blocks]
    bigpic_toc = [block.block_id for block in dax_decode.parse_container(bigpic_data)[1]]
    verify_map_contract("[[bigpicBytes,'BIGPIC1.DAX'],[picBytes,'PIC1.DAX']] pictures.set(block.blockId,block.image) frameIndex:0", pic_toc, bigpic_toc)
    result = []
    for picture,pin in PINS.items():
        hits = [block for block in blocks if block.block_id == picture]
        if len(hits) != 1: raise ValueError("PIC source locator is missing/duplicate")
        block = hits[0]
        raw = census.strict_rle(pic_data[base+block.data_offset:base+block.data_offset+block.comp_size], block.raw_size)
        if len(raw) != pin["rawBytes"] or source.sha(raw) != pin["blockSha256"]:
            raise ValueError("PIC decompressed block pin differs")
        frames = dax_complex_decode.parse_anim_frames(raw, apply_xor=False)
        if frames is None or len(frames) != pin["frameCount"]: raise ValueError("PIC stored-frame roster differs")
        frame = frames[0]
        geometry = [frame[key] for key in ("width","height","x","y")]
        rgb = bytes(dax_complex_decode.frame_pixels_to_rgb(frame["pixels"],frame["width"],frame["height"]))
        if geometry != [88,88,0,0] or source.sha(rgb) != pin["pixelSha256"]:
            raise ValueError("PIC frame0 geometry/RGB pin differs")
        png = source_root / f"dos_complex_render/PIC1/PIC1_{picture:03d}_f0.png"
        if source.sha(png.read_bytes()) != pin["pngSha256"]: raise ValueError("PIC source PNG pin differs")
        with Image.open(png) as image:
            expected = Image.frombytes("RGB",(88,88),rgb).resize((352,352),Image.Resampling.NEAREST)
            if image.size != expected.size or image.convert("RGB").tobytes() != expected.tobytes():
                raise ValueError("PIC full source render pixels differ")
        result.append({"sourceAssetId":asset_id(picture),"archive":"PIC1.DAX","archiveSha256":PIC_SHA,
            "blockId":picture,"frameIndex":0,"geometry":geometry,**pin})
    return result


def verify_receipt(receipt: dict[str, Any]) -> None:
    if (receipt.get("schema") != "cok-throtl-picture-joins-v1" or receipt.get("eclArchiveSha256") != census.ARCHIVES["ECL1.DAX"]["sha256"]
            or receipt.get("eclBlockSha256") != ECL17_SHA or receipt.get("bigpicArchiveSha256") != BIGPIC_SHA
            or receipt.get("hostSource") != [{"role":role,"path":path,"startSymbol":start,"endSymbol":end,"sha256":pin}
                                              for role,path,start,end,pin in HOST]
            or [(row.get("offset"),row.get("pictureId")) for row in receipt.get("sites",[])] != sorted(SITE_ROSTER)):
        raise ValueError("Throtl receipt source/site/host pins differ")
    for site in receipt["sites"]:
        operand = {"kind":"immediate","code":0,"value":site["pictureId"]} if site["pictureId"] is not None else {"kind":"dynamic","code":1,"value":0x7F79}
        if site.get("operand") != operand or site.get("binding") != classify_binding(operand,"local-throtl"):
            raise ValueError("Throtl emitted operand/conditional binding differs")
    if receipt.get("mapContract") != {"order":["BIGPIC1.DAX","PIC1.DAX"],"picToc":PIC_TOC,"bigpicToc":BIGPIC_TOC,
                                      "targetCollisions":[],"selectedOriginalFrame":0}:
        raise ValueError("Throtl map order/frame0 receipt differs")
    if receipt.get("groupedBatchExample") != batch_summary([58,57]):
        raise ValueError("Throtl grouped batch receipt differs")
    if receipt.get("presentationOrigins") != {origin:classify_binding({"code":0,"value":23},origin) for origin in
                                              ("local-throtl","borrowed-travel","supplied","unknown","text-only")}:
        raise ValueError("Throtl conditional/unknown presentation origin differs")
    frames = receipt.get("sourceFrames",[])
    if len(frames) != 3: raise ValueError("Throtl source frame roster differs")
    for picture,pin in PINS.items():
        hits = [row for row in frames if row.get("sourceAssetId") == asset_id(picture)]
        if len(hits) != 1 or any(hits[0].get(key) != value for key,value in {
                "archive":"PIC1.DAX","archiveSha256":PIC_SHA,"blockId":picture,"frameIndex":0,"geometry":[88,88,0,0],**pin}.items()):
            raise ValueError("Throtl source frame pin/locator differs")
    dynamic = next(row for row in receipt["sites"] if row["offset"] == 7268)
    if dynamic.get("operand") != {"kind":"dynamic","code":1,"value":0x7F79} or dynamic.get("binding",{}).get("sourceAssetId") is not None:
        raise ValueError("Dynamic Throtl operand must remain unresolved")


def build_receipt(root: Path = ROOT, source_root: Path = SOURCE_ROOT) -> dict[str, Any]:
    dos = root / "Champions of Krynn"
    blocks = census.read_archive((dos / "ECL1.DAX").read_bytes(),census.ARCHIVES["ECL1.DAX"])
    block17 = next(block for block in blocks if block["blockId"] == 17)
    if block17["rawBytes"] != 7678 or block17["blockSha256"] != ECL17_SHA: raise ValueError("ECL1#17 block pin differs")
    report = source.scan_picture_sites(block17["raw"])
    if [(site["offset"],site["pictureId"]) for site in report["pictureSites"]] != sorted(SITE_ROSTER):
        raise ValueError("Exact eleven-site Throtl roster differs")
    texts = {path:(root/path).read_text(encoding="utf-8") for path in {row[1] for row in HOST}}
    host = verify_host_sources(texts)
    frames = decode_sources((dos/"PIC1.DAX").read_bytes(),(dos/"BIGPIC1.DAX").read_bytes(),source_root)
    sites = [{"offset":site["offset"],"vaddr":site["vaddr"],"operand":site["operand"],"pictureId":site["pictureId"],
        "entries":site["entries"],"binding":classify_binding(site["operand"],"local-throtl"),
        "entryWitnesses":[{"entry":row["entry"],**census.compact_witness(row["steps"])} for row in site["paths"]]} for site in report["pictureSites"]]
    receipt = {"schema":"cok-throtl-picture-joins-v1","task":"SCENE-JOIN-THROTL-17",
        "eclArchiveSha256":census.ARCHIVES["ECL1.DAX"]["sha256"],"eclBlockId":17,"eclRawBytes":7678,"eclBlockSha256":ECL17_SHA,
        "bigpicArchiveSha256":BIGPIC_SHA,"sourceFrames":frames,"hostSource":host,"sites":sites,
        "mapContract":{"order":["BIGPIC1.DAX","PIC1.DAX"],"picToc":PIC_TOC,"bigpicToc":BIGPIC_TOC,
                       "targetCollisions":[],"selectedOriginalFrame":0},
        "presentationOrigins":{origin:classify_binding({"code":0,"value":23},origin) for origin in
            ("local-throtl","borrowed-travel","supplied","unknown","text-only")},
        "groupedBatchExample":batch_summary([58,57]),
        "issues":[{key:value for key,value in issue.items() if key != "path"} for issue in report["issues"]],
        "limits":["Only conditional host/original-source binding; no VM/browser/runtime observation.",
            "All eleven sites are static candidates, not eleven visible scenes; dynamic [0x7f79] is unresolved regardless of a synthetic memory value.",
            "Route feasibility, pauses, effect-batch membership and individual-site visibility remain unresolved.",
            "Local fallback may be text-only; arbitrary supplied presentations do not inherit the pinned map or origin.",
            "(24,24) is conditional on the pinned native presentation with no portraitOrigin override and selected DOS original; overlays/admission remain site-specific unknowns.",
            "PIC1#23 retains eight stored frames; the source-map frame0 contract does not prove frames1-7 unused or temporal animation meaning.",
            "Existing descriptions/consumers/statuses/Restyles/groups/links are preserved; no new canonical IDs or art admission.",
            "Pins identify repository/local render copies, not independently verified retail-install provenance."]}
    verify_receipt(receipt)
    return receipt


def enrich_registry(registry: dict[str, Any], receipt: dict[str, Any]) -> dict[str, Any]:
    verify_receipt(receipt)
    result = copy.deepcopy(registry)
    for picture,pin in PINS.items():
        hits = [asset for asset in result["assets"] if asset.get("id") == asset_id(picture)]
        if len(hits) != 1: raise ValueError("Existing canonical PIC frame0 locator missing/duplicate")
        asset = hits[0]
        if (asset.get("platform") != "DOS-EGA" or asset.get("game") != "cok" or asset.get("archive",{}).get("name") != "PIC1.DAX"
                or asset.get("archive",{}).get("sha256") != PIC_SHA or asset.get("locator") != {
                    "kind":"block-frame","blockId":picture,"entryIndex":None,"frameIndex":0,"tileIndex":None,"cellIndex":None}):
            raise ValueError("Existing PIC archive/frame0 locator conflicts")
        decoded = asset.get("decoded") or {}
        if any(decoded.get(key) != value for key,value in {"sha256":pin["pngSha256"],"pixelSha256":pin["pixelSha256"],"width":88,"height":88}.items()):
            raise ValueError("Existing PIC decoded source pin conflicts")
        offsets = sorted(offset for offset,ident in SITE_ROSTER if ident == picture)
        consumer = {"status":"partial","use":f"Conditional source-only ECL1#17 PICTURE {picture} sites {offsets}: when the host uses the pinned local Throtl or carried travel maps, the original source candidate is DOS PIC1.DAX#{picture}/frame0. Route feasibility, pause visibility, supplied/text-only presentation origin and selected overlay/admission/runtime observation remain unresolved; this is not a visible-scene count.",
            "evidence":[{"kind":"research-doc","reference":RECEIPT,
                "note":f"Exact ECL1#17 site roster, current host/map/frame0/batching contracts and PIC1 archive {PIC_SHA}, block {pin['blockSha256']}, RGB {pin['pixelSha256']}; no new canonical identity or runtime admission."}]}
        prior = [row for row in asset["gameConsumers"] if any(e.get("reference") == RECEIPT for e in row.get("evidence",[]))]
        if prior and (len(prior) != 1 or prior[0] != consumer): raise ValueError("Conflicting existing Throtl consumer receipt")
        if not prior: asset["gameConsumers"].append(consumer)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--write",action="store_true")
    args = parser.parse_args(); receipt = build_receipt()
    registry = json.loads(source.REGISTRY.read_text(encoding="utf-8")); updated = enrich_registry(registry,receipt)
    errors,warnings = source.graphics_asset_registry.validate(updated)
    if errors: raise ValueError("Registry validation failed: " + "; ".join(errors))
    if args.write:
        source.atomic_json(ROOT/RECEIPT,receipt)
        source.atomic_json(source.REGISTRY,updated,validate_registry=True)
    print(json.dumps({"staticSites":len(receipt["sites"]),"conditionalImmediateSites":10,"unresolvedDynamicSites":1,
        "existingSourceRowsEnriched":3,"newCanonicalIds":0,"registryChanged":updated != registry,
        "validationErrors":len(errors),"validationWarnings":len(warnings),"write":args.write},indent=2))
    return 0


if __name__ == "__main__": raise SystemExit(main())
