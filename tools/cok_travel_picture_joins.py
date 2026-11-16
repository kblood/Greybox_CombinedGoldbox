#!/usr/bin/env python3
"""Pinned source-only ECL1#16 travel joins; no VM, visibility or art admission claim."""
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
RECEIPT = 'docs/engine/research/cok-travel-picture-joins-2026-11-03.json'
ROSTER = [(76,121),(1376,114),(1651,18),(1800,121),(3004,58),(3027,58),(3036,121)]
# Measured independently from all seven scanner site/witness records, without added bindings.
SITES_SHA = '5e78e9ebca2bd42d48d4d6f07a688b62089fceb60f6d53758683abc52b2a74e1'
PINS = {
    121: {'archive':'BIGPIC1.DAX','archiveSha256':source.BIGPIC_SHA,'rawBytes':18257,'geometry':[304,120,0,0],
          'frameCount':1,'blockSha256':'62b78a91d3e1b876f15ef70396c87b03279a996b22b5a16f781208f9bea0b395',
          'pixelSha256':'2e88ad9e9cc12487530a07819a458e545f3108d07cb3573216e6746874bc40ba',
          'pngSha256':'e9f69763ee7cc48361cc3d44f2b22182d0a49cec21e7bf06c663478e27c10c91',
          'pngPath':'dos_render_all/BIGPIC1/BIGPIC1_121.png'},
    18: {'archive':'PIC1.DAX','archiveSha256':source.PIC_SHA,'rawBytes':3894,'geometry':[88,88,0,0],
         'frameCount':1,'blockSha256':'682f6487982df42f3dfe2ef294441f67eebc6caad737b1d83bce7c9a2d7a91b0',
         'pixelSha256':'eecd9e7c03da30d517b40e8fcf34ffb2a512097e1979eb28004dd6be68ba1f42',
         'pngSha256':'d05e643ac4e4e58dc8bb232e6e1ef3d8994b80258d70d1321e9ea451d3ebc0b8',
         'pngPath':'dos_complex_render/PIC1/PIC1_018_f0.png'},
    58: {'archive':'PIC1.DAX','archiveSha256':source.PIC_SHA,'rawBytes':3894,'geometry':[88,88,0,0],
         'frameCount':1,'blockSha256':'c856b5763e14bed82ee1fedd687456d750ea0d234c9ed2fa8cda05e960b7d618',
         'pixelSha256':'6701a63e585efddea9d003a5be1b3143e192ab646f6c66d17f623bb7f65562e7',
         'pngSha256':'ab274f539c435b02685a5b612360071906fa93294317846c0fe93e7022d67fc9',
         'pngPath':'dos_complex_render/PIC1/PIC1_058_f0.png'},
}
HOST = [row for row in throtl.HOST if row[0] in {'map','travelMap','vmPicture','lastPicture','translate','paginate',
                                               'frame0','select','surfaceGuard','placement','surfaceMount'}] + [
    ('movement','apps/web/src/ui/explore.ts','    panel.appendChild(graphics);\n    let moving = false;',
     "    const choices = el('div', 'cok-travel-choices');",'1625a0ff41a6a7055f95858712084ebac77a13e0362ff97f05c68cf874970d5e'),
    ('cellRunner','packages/engine/src/world/dialogue.ts','export function dialogueForCell(',
     '\n/**\n * Build a dialogue runner for the **vmRun1**','2da2d1cfa688107d196992be46348cf0a67bd2cb7bb5a5adae57ef3465c07f39'),
    ('searchEntry','packages/engine/src/world/dungeonEvents.ts','export function primeSearchLocation(',
     '\n/**\n * Position a VM','5064110480ee9cf8fb17a5d83abc69b4788b87543713c46da1ef94b84c62104c'),
]


def asset_id(picture):
    return f"cok/dos-ega/disk1/{PINS[picture]['archive'].lower()}/block/{picture}/frame/0"


def expected_host():
    return [{'role':role,'path':path,'startSymbol':start,'endSymbol':end,'sha256':pin} for role,path,start,end,pin in HOST]


def map_contract(pic_toc,bigpic_toc,order=('BIGPIC1.DAX','PIC1.DAX'),frame=0):
    if pic_toc != throtl.PIC_TOC or bigpic_toc != throtl.BIGPIC_TOC or list(order) != ['BIGPIC1.DAX','PIC1.DAX'] or frame != 0:
        raise ValueError('Travel ordered TOC/map/frame0 contract differs')
    for picture,pin in PINS.items():
        selected,other = (bigpic_toc,pic_toc) if pin['archive'] == 'BIGPIC1.DAX' else (pic_toc,bigpic_toc)
        if selected.count(picture) != 1 or picture in other: raise ValueError('Travel source locator missing/duplicate or cross-archive collision')
    return {'order':list(order),'picToc':pic_toc,'bigpicToc':bigpic_toc,'targetCollisions':[],
            'selectedOriginalFrame':0,'duplicatePolicy':'last decoded ID wins; source maps use unconditional Map.set'}


def verify_host(texts):
    for role,path,start,end,pin in HOST:
        text = texts[path]
        if text.count(start) != 1: raise ValueError(f'Travel current host symbol missing/ambiguous: {role}')
        begin = text.index(start); fragment = text[begin:text.index(end,begin)]
        if source.sha(fragment.encode()) != pin: raise ValueError(f'Travel current host fragment SHA differs: {role}')
    return expected_host()


def binding(operand,entry,origin='travel-movement',*,game='cok',context=True,current_mount=True,assets=True,presentation=True):
    # This models only the pinned movement caller. No memory/route execution is performed.
    if (operand.get('kind') != 'immediate' or operand.get('code') != 0 or entry != 'search_location'
            or origin != 'travel-movement' or game != 'cok' or not all((context,current_mount,assets,presentation))):
        return {'status':'caller-or-context-unresolved','sourceAssetId':None}
    picture = operand.get('value')
    if picture == 114: return {'status':'existing-114-evidence-preserved','sourceAssetId':source.ASSET_ID}
    if picture not in PINS: return {'status':'source-unresolved','sourceAssetId':None}
    return {'status':'conditional-original-source','sourceAssetId':asset_id(picture)}


def expected_frames():
    return [{'sourceAssetId':asset_id(picture),'blockId':picture,'frameIndex':0,**pin} for picture,pin in PINS.items()]


def decode_sources(pic,bigpic,source_root=SOURCE_ROOT):
    containers = {}
    for name,data,pin in [('PIC1.DAX',pic,source.PIC_SHA),('BIGPIC1.DAX',bigpic,source.BIGPIC_SHA)]:
        if source.sha(data) != pin: raise ValueError(f'Travel {name} archive SHA differs')
        containers[name] = (data,*dax_decode.parse_container(data))
    contract = map_contract([b.block_id for b in containers['PIC1.DAX'][2]], [b.block_id for b in containers['BIGPIC1.DAX'][2]])
    for picture,pin in PINS.items():
        data,base,blocks = containers[pin['archive']]; hits = [block for block in blocks if block.block_id == picture]
        if len(hits) != 1: raise ValueError('Travel source locator missing/duplicate')
        block = hits[0]; raw = census.strict_rle(data[base+block.data_offset:base+block.data_offset+block.comp_size],block.raw_size)
        if len(raw) != pin['rawBytes'] or source.sha(raw) != pin['blockSha256']: raise ValueError('Travel decompressed block pin differs')
        if pin['archive'] == 'BIGPIC1.DAX':
            dimensions = dax_decode.parse_standard_frame(raw)
            if dimensions is None: raise ValueError('Travel BIGPIC frame0 unavailable')
            width,height,x,y = dimensions; geometry = [width,height,x,y]
            rgb = bytes(dax_decode.frame_to_rgb(raw,width,height,header_len=dax_decode.FRAME_HEADER))
        else:
            frames = dax_complex_decode.parse_anim_frames(raw,apply_xor=False)
            if not frames or len(frames) != pin['frameCount']: raise ValueError('Travel PIC frame0 roster differs')
            frame = frames[0]; geometry = [frame[k] for k in ('width','height','x','y')]; width,height = geometry[:2]
            rgb = bytes(dax_complex_decode.frame_pixels_to_rgb(frame['pixels'],width,height))
        if geometry != pin['geometry'] or source.sha(rgb) != pin['pixelSha256']: raise ValueError('Travel decoded geometry/RGB pin differs')
        path = source_root/pin['pngPath']
        if source.sha(path.read_bytes()) != pin['pngSha256']: raise ValueError('Travel existing source PNG pin differs')
        with Image.open(path) as image:
            expected = Image.frombytes('RGB',(width,height),rgb).resize((width*4,height*4),Image.Resampling.NEAREST)
            if image.size != expected.size or image.convert('RGB').tobytes() != expected.tobytes(): raise ValueError('Travel complete source PNG pixels differ')
    return expected_frames(),contract


def compact_sites(report):
    return [{'offset':s['offset'],'vaddr':s['vaddr'],'pictureId':s['pictureId'],'operand':s['operand'],'entries':s['entries'],
             'entryWitnesses':[{'entry':p['entry'],**census.compact_witness(p['steps'])} for p in s['paths']]} for s in report['pictureSites']]


def verify_receipt(receipt):
    if (receipt.get('schema') != 'cok-travel-picture-joins-v1' or receipt.get('ecl') != {
            'archive':'ECL1.DAX','archiveSha256':source.ECL_SHA,'blockId':16,'rawBytes':3813,
            'blockSha256':source.ECL_BLOCK_SHA,'compressedFileOffset':65,'compressedBytes':3918}
            or receipt.get('sourceFrames') != expected_frames() or receipt.get('hostSource') != expected_host()
            or receipt.get('issues') != []): raise ValueError('Travel receipt source/host pins differ')
    sites = receipt.get('sites',[]); basic = [{k:v for k,v in row.items() if k != 'binding'} for row in sites]
    if ([(row.get('offset'),row.get('pictureId')) for row in basic] != ROSTER
            or source.sha(json.dumps(basic,sort_keys=True,separators=(',',':')).encode()) != SITES_SHA):
        raise ValueError('Travel exact site/operand/entry/witness roster differs')
    for row in sites:
        if row.get('binding') != binding(row['operand'],row['entries'][0]): raise ValueError('Travel caller/context binding differs')
    if receipt.get('mapContract') != map_contract(throtl.PIC_TOC,throtl.BIGPIC_TOC): raise ValueError('Travel map contract differs')
    if receipt.get('groupedBatchExample') != throtl.batch_summary([58,58,121]): raise ValueError('Travel batch/scene-count claim differs')
    if receipt.get('directMapPaintingProvesInitialEntry') is not False: raise ValueError('Travel direct painting does not prove initial-entry caller')


def build_receipt(root=ROOT,source_root=SOURCE_ROOT):
    dos = root/'Champions of Krynn'
    block = next(b for b in census.read_archive((dos/'ECL1.DAX').read_bytes(),census.ARCHIVES['ECL1.DAX']) if b['blockId'] == 16)
    report = source.scan_picture_sites(block['raw']); sites = compact_sites(report)
    for row in sites: row['binding'] = binding(row['operand'],row['entries'][0])
    frames,contract = decode_sources((dos/'PIC1.DAX').read_bytes(),(dos/'BIGPIC1.DAX').read_bytes(),source_root)
    host = verify_host({path:(root/path).read_text(encoding='utf-8') for path in {row[1] for row in HOST}})
    result = {'schema':'cok-travel-picture-joins-v1','task':'SCENE-JOIN-TRAVEL-16',
        'ecl':{'archive':'ECL1.DAX','archiveSha256':source.ECL_SHA,**{k:v for k,v in block.items() if k != 'raw'}},
        'sourceFrames':frames,'hostSource':host,'sites':sites,'mapContract':contract,'issues':report['issues'],
        'directMapPaintingProvesInitialEntry':False,'groupedBatchExample':throtl.batch_summary([58,58,121]),
        'limits':['Offset76 is initial_entry with unresolved campaign caller; direct map painting does not prove this ECL instruction executed.',
          'The six search_location sites are conditional on the pinned openCokTravel movement caller, live campaign context, assets, mount and presentation; no branch feasibility or guaranteed visibility.',
          'Coordinate-choice/text-only, arbitrary supplied and unknown presentations do not inherit the movement map/source binding.',
          'PICTURE batches retain a last-picture register; PRINT pagination and pauses may split batches. Seven static sites are not seven visible scenes.',
          'The existing #114 row, consumers, receipt and admission are preserved; no new #114 evidence is appended.',
          'Selected DOS/Amiga/Restyle mode, overlay/counterpart admission, failure/unavailable output and runtime observation remain unresolved by this slice.',
          'Frame0 source/map selection is verified; no animation semantics or temporal use is inferred.',
          'Only the three existing source rows gain one partial consumer each; prior verified/partial/unknown metadata remains intact. No new identities or art.',
          'Pins identify current local source/render copies, not independently verified retail provenance.']}
    verify_receipt(result); return result


def enrich_registry(registry,receipt):
    verify_receipt(receipt); result = copy.deepcopy(registry)
    for picture,pin in PINS.items():
        hits = [asset for asset in result['assets'] if asset.get('id') == asset_id(picture)]
        if len(hits) != 1: raise ValueError('Travel existing source locator missing/duplicate')
        asset = hits[0]; locator = asset.get('locator',{})
        if (asset.get('game') != 'cok' or asset.get('platform') != 'DOS-EGA' or asset.get('archive',{}).get('name') != pin['archive']
                or asset.get('archive',{}).get('sha256') != pin['archiveSha256'] or locator.get('kind') != 'block-frame'
                or locator.get('blockId') != picture or locator.get('frameIndex') != 0
                or any(locator.get(k) is not None for k in ('entryIndex','tileIndex','cellIndex'))):
            raise ValueError('Travel existing archive/frame0 locator conflict')
        if any(asset.get('decoded',{}).get(k) != v for k,v in {'sha256':pin['pngSha256'],'pixelSha256':pin['pixelSha256'],
                'width':pin['geometry'][0],'height':pin['geometry'][1]}.items()): raise ValueError('Travel existing decoded source pin conflict')
        offsets = [offset for offset,ident in ROSTER if ident == picture and offset != 76]
        consumer = {'status':'partial','use':f'Conditional source-only ECL1#16 search_location PICTURE {picture} sites {offsets}: the pinned openCokTravel movement caller carries the verified DOS {pin["archive"]} frame0 map. Live context/assets/mount/presentation are required. Initial-entry offset76 caller, route feasibility, pause/batch visibility, selected mode/overlay/admission and runtime observation remain unresolved; no scene count.',
            'evidence':[{'kind':'research-doc','reference':RECEIPT,'note':'Exact seven-site/witness roster, current movement/search entry/map/frame0/batching fragments, archive/block/RGB and existing PNG pins. Prior consumers/statuses and #114 evidence preserved; no new identity or art admission.'}]}
        prior = [row for row in asset['gameConsumers'] if any(e.get('reference') == RECEIPT for e in row.get('evidence',[]))]
        if prior and (len(prior) != 1 or prior[0] != consumer): raise ValueError('Conflicting existing travel consumer receipt')
        if not prior: asset['gameConsumers'].append(consumer)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--write',action='store_true'); args = parser.parse_args()
    receipt = build_receipt(); registry = json.loads(source.REGISTRY.read_text(encoding='utf-8')); updated = enrich_registry(registry,receipt)
    errors,warnings = source.graphics_asset_registry.validate(updated)
    if errors: raise ValueError('Registry validation failed: '+'; '.join(errors))
    if args.write:
        source.atomic_json(ROOT/RECEIPT,receipt); source.atomic_json(source.REGISTRY,updated,validate_registry=True)
    print(json.dumps({'staticImmediateSites':7,'conditionalSearchLocationSites':6,'initialEntryCallerUnresolved':1,
        'existingSourceRowsEnriched':3,'newCanonicalIds':0,'registryChanged':updated != registry,
        'validationErrors':len(errors),'validationWarnings':len(warnings),'write':args.write},indent=2)); return 0


if __name__ == '__main__': raise SystemExit(main())
