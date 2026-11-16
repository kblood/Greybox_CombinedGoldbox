#!/usr/bin/env python3
"""Source-only area32 initial-presentation boundary and conditional PIC1#15 joins."""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from PIL import Image
import cok_ecl_picture_census as census
import cok_ecl_picture_consumers as source
import cok_throtl_picture_joins as throtl
import dax_complex_decode
import dax_decode

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path('C:/GoldBoxImg/cok_restyle_work')
RECEIPT = 'docs/engine/research/cok-area32-picture-joins-2026-11-03.json'
HISTORY = 'docs/engine/research/cok-dialogue-pic1-15-restyle-2026-10-26.md'
HISTORY_SHA = '193ede747c9e53358810b13afd27b5a01dce62d82925e296d5544f1e1e6b1ba2'
RUNTIME_MANIFEST = 'apps/web/src/ui/cokDialogue15RestyleManifest.json'
RUNTIME_MANIFEST_SHA = 'be99ab2a1161e1c4d81264df16bfeec7e76204b75d8e5070b9b1eb56bd7ade54'
RUNTIME_PNG_SHA = 'f0e0d4a4e2eae51fed55c8f36ccbba30503898bb7beaab115ddd7eb245e33286'
PIC_SHA = '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97'
ECL_BLOCK_SHA = 'db03a12fcc5857b6e5f2da2b026edf5b66bd5b54c23628f62319a05627df078f'
ASSET15 = 'cok/dos-ega/disk1/pic1.dax/block/15/frame/0'
ROSTER = [(790,255),(1445,62),(2260,1),(3073,15),(4927,61),(5052,63),(5360,23),(5903,34),(5957,15),(6021,34)]
# Compact pin of the independently measured full site/witness metadata, never raw ECL/dialogue.
SITES_SHA = '80a593a44ec13d2e88c7d525b0b80d021bac5443af37a1d24c8841f4f2a899aa'
PINS = {
 10: (15,ASSET15,'0423639c6fb334dd51c1b0234926b200fcaf39c58e70562042c788b27b8fabd5',
      'd6765b3952d75dbd577f2c19bd62735a7f99e27c3b543ebdda5a12927c1f3a77','c006a1fb81405d4f59fbd05704f2bdef53bf9aa89488c510f7ec28a02f6cb920','PIC1_015_f0.png'),
 3: (34,'cok/dos-ega/disk1/pic1.dax/block/34/entry/3/frame/0','1d62db854295d7075c6ea64d2fab165ea96e3276152810ae3329bd56210ff0bf',
     'f9a80fc4efcab76a1c8cc69af0c6b3384aa9baf90cfac8e8b299cb846ff1ef24','8da07808b0cf88339669332e5479f948e3dd7d3f0d0b3f1f64bd418fb5f3247b','PIC1_034_entry1_f0.png'),
 12: (34,'cok/dos-ega/disk1/pic1.dax/block/34/entry/12/frame/0','1d62db854295d7075c6ea64d2fab165ea96e3276152810ae3329bd56210ff0bf',
      'f9a80fc4efcab76a1c8cc69af0c6b3384aa9baf90cfac8e8b299cb846ff1ef24','8da07808b0cf88339669332e5479f948e3dd7d3f0d0b3f1f64bd418fb5f3247b','PIC1_034_entry2_f0.png'),
}
HOST = [
 ('step','apps/web/src/ui/explore.ts','function runStepEvent(','\nfunction crossWilderness(','abff72636a2d31de30719788e2f266525c46a3114ede8b5dcec7ad455dc62489'),
 ('preload','apps/web/src/ui/explore.ts',"  if (baseGameForExplore(gameId) === 'cok') {\n    const current = state;",'    void loadCokWallRestyles(walls)','347bc7b59fdf89da16c08dde40e092c7d07dd5c72a81d67734717725b4f252da'),
] + [row for row in throtl.HOST if row[0] in {'map','vmPicture','lastPicture','translate','paginate','frame0','select','surfaceGuard','placement','surfaceMount'}]


def expected_host():
    return [{'role':role,'path':path,'startSymbol':start,'endSymbol':end,'sha256':pin} for role,path,start,end,pin in HOST]


def verify_host(texts: dict[str,str]):
    for role,path,start,end,pin in HOST:
        text = texts[path]
        if text.count(start) != 1: raise ValueError(f'Area32 host symbol missing/ambiguous: {role}')
        begin = text.index(start); fragment = text[begin:text.index(end,begin)]
        if source.sha(fragment.encode()) != pin: raise ValueError(f'Area32 current host fragment SHA differs: {role}')
    return expected_host()


def initial_mount_binding(retained_picture: int, *, game='cok',disk=1,area=32,current_state=True,current_mount=True,
                          available=True,has15=True,qualifying_menu=True) -> str | None:
    # A model of the pinned initial mounting gate, not a prohibition on subsequent rendering.
    if (retained_picture == 15 and game == 'cok' and disk == 1 and area == 32 and current_state and current_mount
            and available and has15 and qualifying_menu): return ASSET15
    return None


def last_wins(entries: list[dict[str,Any]]) -> dict[int,dict[str,Any]]:
    result = {}
    for row in entries: result[row['blockId']] = dict(row)
    return result


def expected_source_frames():
    return [{'sourceAssetId':ident,'archive':'PIC1.DAX','archiveSha256':PIC_SHA,'blockId':picture,'tocEntry':entry,
             'frameIndex':0,'rawBytes':3894,'blockSha256':raw,'geometry':[88,88,0,0],
             'pixelSha256':rgb,'pngSha256':png} for entry,(picture,ident,raw,rgb,png,_file) in PINS.items()]


def decode_pic1(data: bytes,source_root: Path):
    if source.sha(data) != PIC_SHA: raise ValueError('Area32 PIC1 archive SHA differs')
    base,blocks = dax_decode.parse_container(data)
    if [block.block_id for block in blocks] != throtl.PIC_TOC: raise ValueError('Area32 ordered PIC1 TOC differs')
    frames,entries = [],[]
    for entry,block in enumerate(blocks):
        start = base+block.data_offset
        raw = census.strict_rle(data[start:start+block.comp_size],block.raw_size)
        decoded = dax_complex_decode.parse_anim_frames(raw,apply_xor=False)
        if not decoded: raise ValueError('Area32 PIC1 decoder/frame0 unavailable')
        image = decoded[0]
        geometry = [image[key] for key in ('width','height','x','y')]
        entries.append({'archive':'PIC1.DAX','archiveSha256':PIC_SHA,'blockId':block.block_id,'tocEntry':entry,'frameIndex':0})
        if entry not in PINS: continue
        picture,ident,raw_sha,rgb_sha,png_sha,file = PINS[entry]
        if block.block_id != picture or len(raw) != 3894 or source.sha(raw) != raw_sha or len(decoded) != 1:
            raise ValueError('Area32 PIC source block/entry/frame roster pin differs')
        rgb = bytes(dax_complex_decode.frame_pixels_to_rgb(image['pixels'],image['width'],image['height']))
        if geometry != [88,88,0,0] or source.sha(rgb) != rgb_sha: raise ValueError('Area32 source geometry/RGB differs')
        path = source_root/'dos_complex_render/PIC1'/file
        if source.sha(path.read_bytes()) != png_sha: raise ValueError('Area32 registry source PNG pin differs')
        with Image.open(path) as image:
            expected = Image.frombytes('RGB',(88,88),rgb).resize((352,352),Image.Resampling.NEAREST)
            if image.size != expected.size or image.convert('RGB').tobytes() != expected.tobytes(): raise ValueError('Area32 source PNG pixels differ')
        frames.append(next(row for row in expected_source_frames() if row['tocEntry'] == entry))
    # Keep frame rows in declared pin order, while map resolution retains actual TOC order.
    frames.sort(key=lambda row:list(PINS).index(row['tocEntry']))
    mapping = last_wins(entries)
    if mapping[34]['tocEntry'] != 12: raise ValueError('Area32 duplicate PIC1#34 last-wins identity differs')
    return frames,mapping


def png_distinction(manifest: dict[str,Any]) -> dict[str,Any]:
    if (manifest.get('archiveSha256') != PIC_SHA or manifest.get('blockId') != 15 or manifest.get('frameIndex') != 0
            or manifest.get('source',{}).get('sha256') != RUNTIME_PNG_SHA
            or [manifest['source'].get(key) for key in ('width','height','colorType')] != [88,88,6]):
        raise ValueError('Area32 runtime native-source PNG metadata differs')
    return {'registryDecodedPNG':{'sha256':PINS[10][4],'width':352,'height':352,'role':'verified decoded 4x source PNG'},
            'runtimeNativeSourcePNG':{'sha256':RUNTIME_PNG_SHA,'width':88,'height':88,'colorType':6,
                                      'role':'separate runtime-manifest provenance','pngBytesInspectedInThisSlice':False},
            'sameFile':False,'newAdmission':False}


def make_site(row: dict[str,Any],mapping: dict[int,dict[str,Any]]):
    picture = row['pictureId']
    bound = initial_mount_binding(picture)
    return {'offset':row['offset'],'vaddr':row['vaddr'],'pictureId':picture,'operand':row['operand'],'entries':row['entries'],
            'siteAssetMapping':bound,'status':'conditional-retained15-initial-mount' if bound else 'unmapped-immediate' if picture == 255 else 'site-binding-unresolved',
            'loadedMapCandidate':mapping.get(picture),'historicalRouteOffset':3073 if row['offset'] == 3073 else None,
            'entryWitnesses':[{'entry':path['entry'],**census.compact_witness(path['steps'])} for path in row['paths']]}


def verify_receipt(receipt: dict[str,Any]):
    if (receipt.get('schema') != 'cok-area32-picture-joins-v1' or receipt.get('eclArchiveSha256') != census.ARCHIVES['ECL1.DAX']['sha256']
            or receipt.get('eclBlockSha256') != ECL_BLOCK_SHA or receipt.get('compressedFileOffset') != 12110 or receipt.get('compressedBytes') != 7814
            or receipt.get('sourceFrames') != expected_source_frames() or receipt.get('hostSource') != expected_host()
            or [(row.get('offset'),row.get('pictureId')) for row in receipt.get('sites',[])] != ROSTER):
        raise ValueError('Area32 source/site/host pins differ')
    if (receipt.get('eclBlockId') != 32 or receipt.get('rawBytes') != 7611 or receipt.get('issues') != []
            or source.sha(json.dumps(receipt['sites'],sort_keys=True,separators=(',',':')).encode()) != SITES_SHA):
        raise ValueError('Area32 block/site witness metadata differs')
    for row in receipt['sites']:
        picture = row['pictureId']
        if row.get('operand') != {'kind':'immediate','code':0,'value':picture} or row.get('siteAssetMapping') != initial_mount_binding(picture):
            raise ValueError('Area32 immediate operand/retained15 binding differs')
        expected_status = 'conditional-retained15-initial-mount' if picture == 15 else 'unmapped-immediate' if picture == 255 else 'site-binding-unresolved'
        if row.get('status') != expected_status: raise ValueError('Area32 unresolved/conditional site status differs')
        if row.get('historicalRouteOffset') != (3073 if row['offset'] == 3073 else None): raise ValueError('Area32 historical route scope differs')
        candidate = row.get('loadedMapCandidate')
        if picture == 255:
            if candidate is not None or row.get('status') != 'unmapped-immediate': raise ValueError('Area32 #255 is an unmapped immediate, not a resolved/dynamic/clear-screen claim')
        elif (not candidate or candidate.get('archive') != 'PIC1.DAX' or candidate.get('archiveSha256') != PIC_SHA
              or candidate.get('blockId') != picture or candidate.get('tocEntry') != max(i for i,n in enumerate(throtl.PIC_TOC) if n == picture)
              or candidate.get('frameIndex') != 0): raise ValueError('Area32 loaded-map candidate/order differs')
    if receipt.get('duplicate34') != {'entries':[3,12],'sourceAssetIds':[PINS[3][1],PINS[12][1]],'loadedWinnerEntry':12,'shadowedEntry':3,
                                     'siteBindingsAdded':False,'entrylessIdCreated':False}: raise ValueError('Area32 duplicate34 identity/order differs')
    if receipt.get('historicalEvidence') != {'path':HISTORY,'sha256':HISTORY_SHA,'siteOffset':3073,'vaddr':0x8BFF,'pose':[1,3,'east'],'rerun':False}:
        raise ValueError('Area32 historical evidence pin differs')
    expected_pngs = png_distinction({'archiveSha256':PIC_SHA,'blockId':15,'frameIndex':0,
                                    'source':{'sha256':RUNTIME_PNG_SHA,'width':88,'height':88,'colorType':6}})
    if receipt.get('pngDistinction') != expected_pngs:
        raise ValueError('Area32 registry/runtime PNG distinction differs')


def build_receipt(root: Path = ROOT,source_root: Path = SOURCE_ROOT):
    blocks = census.read_archive((root/'Champions of Krynn/ECL1.DAX').read_bytes(),census.ARCHIVES['ECL1.DAX'])
    block = next(row for row in blocks if row['blockId'] == 32)
    if (block['rawBytes'],block['blockSha256'],block['compressedFileOffset'],block['compressedBytes']) != (7611,ECL_BLOCK_SHA,12110,7814):
        raise ValueError('Area32 ECL block pin/framing differs')
    report = source.scan_picture_sites(block['raw'])
    if [(row['offset'],row['pictureId']) for row in report['pictureSites']] != ROSTER: raise ValueError('Area32 exact ten-site roster differs')
    frames,mapping = decode_pic1((root/'Champions of Krynn/PIC1.DAX').read_bytes(),source_root)
    texts = {path:(root/path).read_text(encoding='utf-8') for path in {row[1] for row in HOST}}
    host = verify_host(texts)
    history = (root/HISTORY).read_text(encoding='utf-8'); start = history.index('## Actual route and explicit limitation'); end = history.index('## Implementation and verification',start)
    if source.sha(history[start:end].encode()) != HISTORY_SHA: raise ValueError('Area32 historical route fragment differs')
    manifest = (root/RUNTIME_MANIFEST).read_bytes()
    if source.sha(manifest) != RUNTIME_MANIFEST_SHA: raise ValueError('Area32 runtime source manifest pin differs')
    result = {'schema':'cok-area32-picture-joins-v1','task':'SCENE-JOIN-AREA32','eclArchiveSha256':census.ARCHIVES['ECL1.DAX']['sha256'],
        'eclBlockId':32,'rawBytes':7611,'eclBlockSha256':ECL_BLOCK_SHA,'compressedFileOffset':12110,'compressedBytes':7814,
        'hostSource':host,'sourceFrames':frames,'sites':[make_site(row,mapping) for row in report['pictureSites']],
        'duplicate34':{'entries':[3,12],'sourceAssetIds':[PINS[3][1],PINS[12][1]],'loadedWinnerEntry':12,'shadowedEntry':3,
                       'siteBindingsAdded':False,'entrylessIdCreated':False},
        'historicalEvidence':{'path':HISTORY,'sha256':HISTORY_SHA,'siteOffset':3073,'vaddr':0x8BFF,'pose':[1,3,'east'],'rerun':False},
        'pngDistinction':png_distinction(json.loads(manifest)),
        'issues':[{key:value for key,value in row.items() if key != 'path'} for row in report['issues']],
        'limits':['Only the retained-picture15 initial mounting gate is bound, conditionally on CoK/disk1/area32, current state/mount, preload/#15 availability and a qualifying menu.',
          'Seven other literal sites remain site-binding-unresolved despite numeric membership in the loaded map. A previously mounted #15 presentation could render later non15 pictures; no impossibility claim.',
          '#255 is an unmapped immediate; its meaning remains unknown and no clear-screen/dynamic claim is made.',
          'Only offset3073 has the cited historical natural-route evidence. Offset5957 has no new route/visibility observation.',
          'Last-picture batches and PRINT pagination do not imply one visible scene per static PICTURE; route/pause/batch feasibility remain unresolved.',
          'Portrait origin and selected DOS/Amiga/Restyle overlays/admission remain conditional on actual native presentation and mode; no runtime acceptance is added.',
          'Duplicate#34 locators remain distinct, with entry12 last-wins and entry3 shadowed; no entryless identity or consumer update is created.',
          'Registry decoded 4x PNG and runtime-manifest 88x88 RGBA provenance are distinct files; no new art/PNG equivalence/admission claim.',
          'Source pins identify local copies, not independent retail provenance. No VM/browser execution, IDs or unrelated metadata changes.']}
    verify_receipt(result); return result


def verify_registry_sources(registry):
    if any(row.get('id') == 'cok/dos-ega/disk1/pic1.dax/block/34/frame/0' for row in registry['assets']):
        raise ValueError('Area32 duplicate34 must remain entry-qualified')
    for entry,(picture,ident,_raw,rgb,png,_file) in PINS.items():
        hits = [row for row in registry['assets'] if row.get('id') == ident]
        if len(hits) != 1: raise ValueError('Area32 existing locator missing/duplicate')
        asset = hits[0]
        if (asset.get('game') != 'cok' or asset.get('platform') != 'DOS-EGA' or asset.get('archive',{}).get('name') != 'PIC1.DAX'
                or asset.get('archive',{}).get('sha256') != PIC_SHA or asset.get('locator') != {'kind':'block-frame','blockId':picture,
                    'entryIndex':None if picture == 15 else entry,'frameIndex':0,'tileIndex':None,'cellIndex':None}):
            raise ValueError('Area32 archive/entry/frame0 locator conflicts')
        decoded = asset.get('decoded') or {}
        if any(decoded.get(key) != value for key,value in {'sha256':png,'pixelSha256':rgb,'width':88,'height':88}.items()):
            raise ValueError('Area32 existing decoded source pin conflicts')


def enrich_registry(registry,receipt):
    verify_receipt(receipt); verify_registry_sources(registry); result = copy.deepcopy(registry)
    asset = next(row for row in result['assets'] if row['id'] == ASSET15)
    consumer = {'status':'partial','use':'Conditional area32 source evidence for ECL1#32 PICTURE 15 sites at offsets 3073/5957: runStepEvent supplies the preloaded PIC1 presentation only when retainedPictureId is 15, after current CoK disk1/area32 preload/#15 and qualifying-menu gates. Only 3073 has the cited historical natural-route receipt; 5957 visibility and route feasibility remain unresolved. Other literal sites have loaded-map candidates only and might render after a #15 presentation is already mounted.',
        'evidence':[{'kind':'research-doc','reference':RECEIPT,'note':'Pinned ECL/PIC1/site/current-host/frame0 evidence; no new runtime/art admission or canonical ID.'},
                    {'kind':'research-doc','reference':HISTORY,'note':'Historical natural-route evidence applies only to site 3073/0x8bff at (1,3,east); not rerun here.'}]}
    prior = [row for row in asset['gameConsumers'] if any(e.get('reference') == RECEIPT for e in row.get('evidence',[]))]
    if prior and (len(prior) != 1 or prior[0] != consumer): raise ValueError('Conflicting area32 consumer receipt')
    if not prior: asset['gameConsumers'].append(consumer)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--write',action='store_true'); args = parser.parse_args()
    receipt = build_receipt(); registry = json.loads(source.REGISTRY.read_text(encoding='utf-8')); updated = enrich_registry(registry,receipt)
    errors,warnings = source.graphics_asset_registry.validate(updated)
    if errors: raise ValueError('Registry validation failed: '+'; '.join(errors))
    if args.write:
        source.atomic_json(ROOT/RECEIPT,receipt); source.atomic_json(source.REGISTRY,updated,validate_registry=True)
    print(json.dumps({'staticImmediateSites':10,'conditional15Sites':2,'otherLiteralSitesUnresolved':7,'unmappedImmediate255Sites':1,
        'existingRowsEnriched':1,'newCanonicalIds':0,'registryChanged':updated != registry,'validationErrors':len(errors),
        'validationWarnings':len(warnings),'write':args.write},indent=2)); return 0


if __name__ == '__main__': raise SystemExit(main())
