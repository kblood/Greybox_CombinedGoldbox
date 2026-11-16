#!/usr/bin/env python3
"""Source-only ECL2#57 original-picture/component joins; no VM/runtime/art admission."""
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
SOURCE_ROOT = Path("C:/GoldBoxImg/cok_restyle_work")
RECEIPT = "docs/engine/research/cok-demo-picture-joins-2026-11-03.json"
ROSTER = [(97,70),(401,68),(590,116),(690,59),(855,23)]
ECL_BLOCK_SHA = "96230e908f62a14a289c3cda086c8dc0e43e93e1e8d755a83cde6730300bff8e"
COMPOSITE_SHA = "473b68836ba72a5f64e0dd27bc5a916ec0e4ad27f0e1c1498865ef89a6ccb55b"
ARCHIVES = {
 "PIC2.DAX": ("b4c07f963edcb88973ba7f3caa80cbcae4c88b3c71aa4c7ad3132ccbed1dbc51",[1,2,5,6,8,14,19,35,41,44,48,51,54,67,59,60,4,10,17,23,25,28,33,34,56,70]),
 "BIGPIC2.DAX": ("553dc458be8209bea0ca5f1dea6406b5cd8a96750d3badc05658f5a8ef241f0a",[116,119]),
 "HEAD2.DAX": ("9b26657869b3d033866de66ace9e8ebde3dedfcdae5ed05fa00fc9d00bbec27b",[68,69]),
 "BODY2.DAX": ("7edd8e0841581b1643828a21787594f6c96dddc1718710de9a8159575bef467f",[68]),
}
# Explicit existing identities: disk1 HEAD2/BODY2 are legacy IDs and must not be renamed.
SOURCES = [
 ("cok/dos-ega/disk2/pic2.dax/block/70/frame/0","PIC2.DAX",70,3894,1,[88,88,0,0],"2c5abdae637317882e9ae0b57fa08ed6ef5bebd521ba5132bc01c546f10d981d","441c8ffccf51aa1504825281fac6d5be9980c74c6f1a717ae9f949d9d24456c2","66fb79c211c2eb157683ff1728e5e91c1ab55cd3df06bf789c3cd8f452954ac9"),
 ("cok/dos-ega/disk1/head2.dax/block/69/frame/0","HEAD2.DAX",69,1777,1,[88,40,0,0],"ca9d8db91a83c7acb85583dff49d495cb311d48a394efb8f8c9bbe5342905425","34b5f0dbb720b1e4240a908addde9c2f55786692aa989f007645b4183debee7d","bbc1a2ee865060ad4add766989154258aa14b365e84c01e242ec237fe03b2942"),
 ("cok/dos-ega/disk1/body2.dax/block/68/frame/0","BODY2.DAX",68,2129,1,[88,48,0,0],"ef02943328a8ba0cc54e9135655bff74788a3a4b47dcc11a92df617c17f26490","c904fd706db499b395558fb44fdcac6b73ad9cdc67bac1a1a4d516cb6eb54d76","edbaebee8325a280125987853aea7a28e6fd30a44131bd245bfa7fe2f3238bbe"),
 ("cok/dos-ega/disk2/bigpic2.dax/block/116/frame/0","BIGPIC2.DAX",116,18257,1,[304,120,0,0],"9c2f3cfc44bd9f04ad7703e00e59a887b385f2b3d3051ead6128d5fa587847fd","dd0863b9d2ede3176693778e1a48af9d7937b2f5988294c163ce9d7013aa7ecc","a73dfc3744f1e70e940d0e1facf47415103eec79d83e81aecea4365e89fdc4d2"),
 ("cok/dos-ega/disk2/pic2.dax/block/59/frame/0","PIC2.DAX",59,3894,1,[88,88,0,0],"795149f8458b559d72a34e13b004ddc4f06c8c6916a6d96fa4e2160d5c5a1866","68e0eabba1e128abaa3d78b923a80742f83da369777a8673b7b952ec470506d0","e600ff970cf1e45edb955226b2c118ee7fbf1e0259f5692c694018feea7d36b9"),
 ("cok/dos-ega/disk2/pic2.dax/block/23/frame/0","PIC2.DAX",23,31145,8,[88,88,0,0],"2a10157f1f46017a10c0053fd8fb101167e6a811441eacaf5952ca2a450333fa","09b26589751f5511b51c0c975a86a9c9423ad3e7f487b297f24a4b450e94f1f8","3858d73cd9a7920cfd0ef7a480ca481fc9ad70c2d4407774ba8873177c4fe010"),
]
DEMO = "apps/web/src/ui/demoGen1.ts"
HOST = [
 ("profile","apps/web/src/ui/demo.ts","const COK_DEMO_PROFILE:","\nexport type DemoHooks","1e58d1d2e03276defc2c00faec32f01b9d6f9ed1f90fea8e939b54112bf97152"),
 ("start","apps/web/src/ui/demo.ts","export function startDemo(",None,"673c72415cfa878bee060033db561ad34ee2cbfd136a169914df28b090f69399"),
 ("fetch",DEMO,"  let eclBytes:","  // Merge every configured","be17d1c3c552de764c879d57ba47d7637f12541a24beb3a9a028c982bb21e4bb"),
 ("firstWins",DEMO,"  // Merge every configured","  if (profile.runtimeArt && amigaPictureBytes)","63cdc1f6cbd87adc60565897a83387784fc0b558e90b0d74c36241b7a1a91800"),
 ("composite",DEMO,"  // CoK's shopkeeper","  const walkBackdropFrames","9653e8edaaa81393b50de66a12d32376d61f250292cc5b263079b1e7bbb72df4"),
 ("flatten",DEMO,"function flattenOne(","function walkToPause(","f2beab00e1a844f11dd48cd2a12f64cd8a8c9edc59aeeb6173717b35b78023bf"),
 ("walk",DEMO,"function walkToPause(","function toEclCombatOutcome(","11b1f3f088210e4d571dd790032f5f65b44dd72b5c2cc41c86dda57605c4edf0"),
 ("apply",DEMO,"function applyBeat(","function driveCombat(","fcf5593c7dffe3da66af815dc9a1e2d093b06f43bb24a238b0805dbd96618ca6"),
 ("render",DEMO,"function renderDemoScreen(","function ensureDemoRestyle(","a0f8d37ec556db6a020725ac5a2bc07fa8e37b7b7bf517cc4fb8b6e18114fd81"),
 ("initialVm",DEMO,"  const vm = new EclVm(block.raw,","  const restyleCanvas = profile.runtimeArt","3ca014a3b4367a761bfd4758cb72ed71f8635c70a1f2aa5fc3d06a179b423ef1"),
 ("tick",DEMO,"function tick():","export async function startGen1Demo(","93c7d8592f2a3e243b61845573c632cce6a858f19d29f06f24786a774ef0f58c"),
 ("standardOpaque","packages/engine/src/loaders/dax.ts","    const fr = parseStandardFrame(blk.raw);","    // Gateway VGA-extended single-frame picture","26df6c7fdc57ec3e0ded6867da04e5555f90e10479e1f25c683e221b306eae52"),
 ("standardDeroll","packages/engine/src/loaders/dax.ts","function derollFrameIndices(","\nconst ANIM_FRAME_HEADER","05bb38a188467b36aa4ad1a69040783acf4532014211937346c900f37cd439ec"),
 ("blit","packages/engine/src/render/screen.ts","export function blitIndexed(","/**","c1ae24a34dcda6429012dd0dfd308da19f505e5edb976b3ae0198697ea35fcbb"),
 ("vmPicture","packages/engine/src/ecl/vm.ts","      case 0x0e: // PICTURE id","\n      case 0x3d:","6016f7ee0b0822f5e4409469294f433cecae5718400ebda0b32f058c67846ecd"),
 ("dialogueLastPicture","packages/engine/src/world/dialogue.ts","function lastPicture(","\n/** The most recent prompt","486cbc30b14e20792c16b065170ad199bb94c4734dc54722d0d622ded717fe8f"),
]


def expected_host() -> list[dict[str,Any]]:
    return [{"role":role,"path":path,"startSymbol":start,"endSymbol":end,"sha256":pin} for role,path,start,end,pin in HOST]


def verify_host(texts: dict[str,str]) -> list[dict[str,Any]]:
    for role,path,start,end,pin in HOST:
        text = texts[path]
        if text.count(start) != 1: raise ValueError(f"Demo host symbol missing/ambiguous: {role}")
        begin = text.index(start); finish = text.index(end,begin) if end else len(text)
        if source.sha(text[begin:finish].encode()) != pin: raise ValueError(f"Demo current host fragment SHA differs: {role}")
    return expected_host()


def first_wins(archives: list[dict[int,Any]]) -> dict[int,Any]:
    result = {}
    for archive in archives:
        for key,value in archive.items():
            if key not in result and value is not None: result[key] = value
    return result


def compose_parts(parts: list[dict[str,Any] | None]) -> dict[str,Any]:
    if len(parts) != 2 or any(part is None for part in parts): return {"complete":False,"rgb":None}
    expected = [(SOURCES[1],0,0),(SOURCES[2],0,40)]
    pixels = bytearray(88*88*3)
    for part,(spec,x,y) in zip(parts,expected):
        if (part.get("sourceAssetId") != spec[0] or part.get("geometry") != spec[5] or part.get("frameIndex") != 0
                or part.get("x") != x or part.get("y") != y or "transparentIndex" not in part or part.get("transparentIndex") is not None
                or source.sha(part["rgb"]) != spec[7]):
            raise ValueError("Demo composite role/order/placement/geometry/pixels/frame0/mask contract differs")
        width,height = part["geometry"][:2]
        for row in range(height):
            at = ((y+row)*88+x)*3; pixels[at:at+width*3] = part["rgb"][row*width*3:(row+1)*width*3]
    if source.sha(pixels) != COMPOSITE_SHA: raise ValueError("Demo composition RGB golden differs")
    return {"complete":True,"rgb":bytes(pixels)}


def apply_composite(mapping: dict[int,Any], parts: list[dict[str,Any] | None]) -> tuple[dict[int,Any],bool]:
    result = dict(mapping); composite = compose_parts(parts)
    if composite["complete"]: result[68] = composite["rgb"]
    return result,composite["complete"]


def source_candidates(picture: int, mode="DOS-EGA", available=True, profile="cok-demo-ecl2-57") -> dict[str,Any]:
    if mode != "DOS-EGA" or not available or profile != "cok-demo-ecl2-57":
        return {"status":"unresolved-mode/failure/profile","sourceAssetIds":[],"initialFrame":None}
    ids = [row[0] for row in SOURCES if (picture == 68 and row[1] in ("HEAD2.DAX","BODY2.DAX")) or
           (picture != 68 and row[2] == picture and row[1] in ("PIC2.DAX","BIGPIC2.DAX"))]
    return {"status":"conditional-original-source","sourceAssetIds":ids,"initialFrame":0 if ids else None}


def batch_contract(ids: list[int]) -> dict[str,Any]:
    return {"demoPictureBeatOrder":list(ids),"dialogueRunnerLastPicture":ids[-1] if ids else None,
        "sameConsumer":False,"visibleSceneCount":None,
        "note":"Demo flattenOne retains each picture beat; tick groups following text. DialogueRunner lastPicture batch collapse is a separate host. No runtime timing/visibility observation."}


def verify_standard_no_deroll(raw: bytes, width: int, height: int) -> None:
    # Independently evaluate the pinned loader helper's guard; retain raw RGB only if unchanged.
    if width < 64 or height < 64: return
    indices = [index for byte in raw[17:17+width*height//2] for index in (byte >> 4,byte & 15)]
    misses = [sum(indices[y*width+k] != indices[y*width+(width-1+k)%width] for y in range(height))
              for k in range(min(40,width//4)+1)]
    best = min(range(len(misses)),key=lambda k:misses[k])
    if best > 0 and misses[best] <= 2 and misses[0] >= max(8,height//10) and misses[0] >= 8*max(1,misses[best]):
        raise ValueError('Pinned loader de-roll changes source pixels; conditional join needs further review')


def decode_sources(root: Path, source_root: Path) -> tuple[list[dict[str,Any]],list[dict[str,Any]]]:
    loaded = {}
    for name,(pin,toc) in ARCHIVES.items():
        data = (root/"Champions of Krynn"/name).read_bytes()
        if source.sha(data) != pin: raise ValueError(f"Demo archive SHA differs: {name}")
        base,blocks = dax_decode.parse_container(data)
        if [block.block_id for block in blocks] != toc: raise ValueError("Demo ordered archive TOC differs")
        loaded[name] = data,base,blocks
    metadata,parts = [],[]
    for ident,name,block_id,raw_size,frame_count,geometry,block_sha,rgb_sha,png_sha in SOURCES:
        data,base,blocks = loaded[name]; hits = [block for block in blocks if block.block_id == block_id]
        if len(hits) != 1: raise ValueError("Demo source locator missing/duplicate")
        block = hits[0]; start = base+block.data_offset
        raw = census.strict_rle(data[start:start+block.comp_size],block.raw_size)
        if len(raw) != raw_size or source.sha(raw) != block_sha: raise ValueError("Demo decompressed block pin differs")
        if name == 'PIC2.DAX':
            frames = dax_complex_decode.parse_anim_frames(raw,apply_xor=False)
            if frames is None or len(frames) != frame_count: raise ValueError("Demo stored frame roster differs")
            frame = frames[0]; actual_geometry = [frame[key] for key in ('width','height','x','y')]
            rgb = bytes(dax_complex_decode.frame_pixels_to_rgb(frame['pixels'],frame['width'],frame['height']))
            png = source_root/f"dos_complex_render/PIC2/PIC2_{block_id:03d}_f0.png"
        else:
            actual_geometry = list(dax_decode.parse_standard_frame(raw) or ())
            verify_standard_no_deroll(raw,geometry[0],geometry[1])
            rgb = bytes(dax_decode.frame_to_rgb(raw,geometry[0],geometry[1],dax_decode.FRAME_HEADER))
            png = source_root/f"dos_render_all/{name[:-4]}/{name[:-4]}_{block_id:03d}.png"
        if actual_geometry != geometry or source.sha(rgb) != rgb_sha: raise ValueError("Demo decoded frame0 geometry/RGB differs")
        if source.sha(png.read_bytes()) != png_sha: raise ValueError("Demo source PNG pin differs")
        with Image.open(png) as image:
            expected = Image.frombytes('RGB',tuple(geometry[:2]),rgb).resize((geometry[0]*4,geometry[1]*4),Image.Resampling.NEAREST)
            if image.size != expected.size or image.convert('RGB').tobytes() != expected.tobytes(): raise ValueError("Demo exact source render differs")
        metadata.append({"sourceAssetId":ident,"archive":name,"archiveSha256":ARCHIVES[name][0],"blockId":block_id,
            "blockSha256":block_sha,"rawBytes":raw_size,"storedFrames":frame_count,"frameIndex":0,"geometry":geometry,
            "pixelSha256":rgb_sha,"pngSha256":png_sha})
        if name in ('HEAD2.DAX','BODY2.DAX'):
            parts.append({"sourceAssetId":ident,"frameIndex":0,"geometry":geometry,"rgb":rgb,
                          "x":0,"y":0 if name == 'HEAD2.DAX' else 40,"transparentIndex":None})
    return metadata,parts


def verify_receipt(receipt: dict[str,Any]) -> None:
    if (receipt.get('schema') != 'cok-demo-picture-joins-v1' or receipt.get('eclArchiveSha256') != census.ARCHIVES['ECL2.DAX']['sha256']
            or receipt.get('eclBlockSha256') != ECL_BLOCK_SHA or receipt.get('hostSource') != expected_host()
            or [(row.get('offset'),row.get('pictureId')) for row in receipt.get('sites',[])] != ROSTER):
        raise ValueError("Demo receipt ECL/site/host pins differ")
    expected = [{"sourceAssetId":ident,"archive":name,"archiveSha256":ARCHIVES[name][0],"blockId":block_id,
        "blockSha256":block_sha,"rawBytes":raw_size,"storedFrames":count,"frameIndex":0,"geometry":geometry,
        "pixelSha256":rgb_sha,"pngSha256":png_sha} for ident,name,block_id,raw_size,count,geometry,block_sha,rgb_sha,png_sha in SOURCES]
    if receipt.get('sourceFrames') != expected: raise ValueError("Demo source frame/archive pins differ")
    for row in receipt['sites']:
        if row.get('operand') != {"kind":"immediate","code":0,"value":row['pictureId']} or row.get('conditionalBinding') != source_candidates(row['pictureId']):
            raise ValueError("Demo immediate operand/source binding differs")
    if receipt.get('composition') != {"pictureId":68,"geometry":[88,88],"parts":[
            {"sourceAssetId":SOURCES[1][0],"x":0,"y":0,"frameIndex":0,"transparentIndex":None},
            {"sourceAssetId":SOURCES[2][0],"x":0,"y":40,"frameIndex":0,"transparentIndex":None}],
            "rgbSha256":COMPOSITE_SHA,"complete":True,"newCanonicalId":None}:
        raise ValueError("Demo composite contract/golden differs")
    if receipt.get('batchContract') != batch_contract([70,68,116,59,23]): raise ValueError("Demo beat/batch contract differs")


def build_receipt(root: Path = ROOT, source_root: Path = SOURCE_ROOT) -> dict[str,Any]:
    blocks = census.read_archive((root/'Champions of Krynn/ECL2.DAX').read_bytes(),census.ARCHIVES['ECL2.DAX'])
    block = next(row for row in blocks if row['blockId'] == 57)
    if block['rawBytes'] != 1096 or block['blockSha256'] != ECL_BLOCK_SHA: raise ValueError('Demo ECL2#57 pin differs')
    report = source.scan_picture_sites(block['raw'])
    if [(row['offset'],row['pictureId']) for row in report['pictureSites']] != ROSTER: raise ValueError('Exact five-site demo roster differs')
    texts = {path:(root/path).read_text(encoding='utf-8') for path in {row[1] for row in HOST}}
    host = verify_host(texts); frames,parts = decode_sources(root,source_root); composite = compose_parts(parts)
    if not composite['complete']: raise ValueError('Demo composite parts unavailable')
    sites = [{"offset":row['offset'],"vaddr":row['vaddr'],"pictureId":row['pictureId'],"operand":row['operand'],
        "entries":row['entries'],"conditionalBinding":source_candidates(row['pictureId']),
        "entryWitnesses":[{"entry":path['entry'],**census.compact_witness(path['steps'])} for path in row['paths']]} for row in report['pictureSites']]
    result = {"schema":"cok-demo-picture-joins-v1","task":"SCENE-JOIN-DEMO-57","eclArchiveSha256":census.ARCHIVES['ECL2.DAX']['sha256'],
        "eclBlockId":57,"eclBlockSha256":ECL_BLOCK_SHA,"eclRawBytes":1096,"hostSource":host,"sourceFrames":frames,"sites":sites,
        "composition":{"pictureId":68,"geometry":[88,88],"parts":[{key:value for key,value in part.items() if key not in ('rgb','geometry')} for part in parts],
                       "rgbSha256":source.sha(composite['rgb']),"complete":True,"newCanonicalId":None},
        "batchContract":batch_contract([70,68,116,59,23]),
        "mapContract":"Pinned CoK demo profile loads PIC2 before BIGPIC2; first decoded ID wins. Only a complete HEAD2#69 + BODY2#68 composite replaces map id68; missing parts do not replace an existing entry.",
        "conditions":["Pinned CoK profile ECL2#57, ECL_GEN1 and exact source archives; original candidates only, not general campaign sources.",
            "applyBeat initially selects frame0; later animate beats may advance stored frames. PIC2#23 frames1-7 timing/playback remain unknown.",
            "DOS original portrait placement defaults to (24,24) and big pictures to (8,8), each with source offsets; profile/mode/overlay conditions still apply.",
            "Demo keeps ordered picture beats; DialogueRunner lastPicture batching is a separate consumer. No scene-count or pause-visibility proof.",
            "No VM/browser/runtime observation, campaign reachability, Amiga equivalence or new DOS/Restyle admission follows from these joins.",
            "BIGPIC2#116 DOS source is distinct from the Amiga BIGPIC1#116 Restyle source; existing metadata/admission states are preserved.",
            "Failure/unavailable assets, non-DOS modes and other profiles remain unresolved. Source pins identify local copies, not independent retail provenance."],
        "issues":[{key:value for key,value in row.items() if key != 'path'} for row in report['issues']]}
    verify_receipt(result); return result


def enrich_registry(registry: dict[str,Any], receipt: dict[str,Any]) -> dict[str,Any]:
    verify_receipt(receipt); result = copy.deepcopy(registry)
    for ident,name,block_id,_size,_frames,geometry,_block_sha,rgb_sha,png_sha in SOURCES:
        hits = [row for row in result['assets'] if row.get('id') == ident]
        if len(hits) != 1: raise ValueError('Existing demo source ID missing/duplicate')
        asset = hits[0]; locator = asset.get('locator') or {}
        if (asset.get('platform') != 'DOS-EGA' or asset.get('game') != 'cok' or asset.get('archive',{}).get('name') != name
                or asset.get('archive',{}).get('sha256') != ARCHIVES[name][0] or locator.get('kind') != 'block-frame'
                or locator.get('blockId') != block_id or locator.get('frameIndex') != 0
                or any(locator.get(key) is not None for key in ['entryIndex','tileIndex','cellIndex'])):
            raise ValueError('Existing demo archive/frame0 locator conflicts')
        decoded = asset.get('decoded') or {}
        if any(decoded.get(key) != value for key,value in {'sha256':png_sha,'pixelSha256':rgb_sha,'width':geometry[0],'height':geometry[1]}.items()):
            raise ValueError('Existing demo source PNG/RGB/geometry conflicts')
        picture = 68 if name in ('HEAD2.DAX','BODY2.DAX') else block_id
        offset = next(offset for offset,value in ROSTER if value == picture)
        consumer = {"status":"partial","use":f"Conditional source-only CoK demo ECL2#57 PICTURE {picture} at offset {offset}: {ident} is an original-source {'component of the complete HEAD2/BODY2 assembly' if picture == 68 else 'candidate'} under the pinned CoK demo profile, map order and initial frame0 contract. Visibility, timing, campaign reachability, unavailable/mode outcomes and selected DOS/Amiga/Restyle runtime admission remain unresolved by this receipt.",
            "evidence":[{"kind":"research-doc","reference":RECEIPT,"note":f"Exact five-site ECL roster, current host fragments, {name} archive {ARCHIVES[name][0]}, block/frame pixels and source PNG are pinned. No new or renamed identity, semantic promotion, animation or admission."}]}
        prior = [row for row in asset['gameConsumers'] if any(e.get('reference') == RECEIPT for e in row.get('evidence',[]))]
        if prior and (len(prior) != 1 or prior[0] != consumer): raise ValueError('Conflicting demo consumer receipt')
        if not prior: asset['gameConsumers'].append(consumer)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--write',action='store_true'); args = parser.parse_args()
    receipt = build_receipt(); registry = json.loads(source.REGISTRY.read_text(encoding='utf-8')); updated = enrich_registry(registry,receipt)
    errors,warnings = source.graphics_asset_registry.validate(updated)
    if errors: raise ValueError('Registry validation failed: ' + '; '.join(errors))
    if args.write:
        source.atomic_json(ROOT/RECEIPT,receipt); source.atomic_json(source.REGISTRY,updated,validate_registry=True)
    print(json.dumps({'staticSites':5,'existingSourceRows':6,'newCanonicalIds':0,'registryChanged':updated != registry,
                      'compositionRgbSha256':receipt['composition']['rgbSha256'],'validationErrors':len(errors),
                      'validationWarnings':len(warnings),'write':args.write},indent=2)); return 0


if __name__ == '__main__': raise SystemExit(main())
