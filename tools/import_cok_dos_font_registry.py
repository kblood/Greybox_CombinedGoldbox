#!/usr/bin/env python3
"""Verify DOS CoK block201 whole-sheet lineage; read-only unless --write is supplied."""
from __future__ import annotations

import argparse
import copy
import io
import json
from pathlib import Path

from PIL import Image
import cok_ecl_picture_census as census
import cok_ecl_picture_consumers as common
import dax_decode

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path('C:/GoldBoxImg/cok_restyle_work')
PACKAGE = ROOT/'apps/web/dist-app-cok57/restyle/cok-generated'
RECEIPT = ROOT/'docs/engine/research/cok-dos-font-source-lineage-v1.json'
ASSET = 'cok/dos-ega/disk1/8x8d1.dax/block/201/whole'
CARD = 'asset-1574-9f86c0bfe16e'
RESTYLE = f'restyle/cok-generated/{CARD}'
ARCHIVE_SHA = '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915'
RAW_SHA = 'fca3a918bd20e24456f579d20341278a21d3b5f5b4e205384fadeb551ce091c1'
SOURCE_SHA = '81284951d116eb51c12d454254e83cbb74cf15cbe1366e71b30d3de8de486a4d'
RGB_SHA = '43d673f376f51d302e81d3578f36bc3dc812aa6c90f869585578454072c4d004'
OUTPUT_SHA = '5d50f75464e5761a8ae2192047422c839e786d5c8f67c7d68b0e0d27265d3d65'
LEDGER_SHA = '07782d56fae9350f952e442bf034085ef90521cae88020cd13a25aece7468be1'
MANIFEST_SHA = 'd5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9'
TOC = [201,202,203,11,12,31,32,23]
BG,FG = (32,28,40),(234,222,190)
REVIEW_NOTE = 'Glyph mask review: 175/177 exact; two sparse-detail exceptions. Overall composition not reviewed.'
ALIAS = {'ledger':'dos_font_coverage.json','ledgerKind':'dos-font-atlas','entry':0,'platform':'DOS',
         'family':'8X8D1 font atlas','status':'saved-reviewed','asset':201,'sourceName':'source_sheet.png',
         'sourceProvenance':'dos/font_block201_source/source_sheet.png','reviewNote':REVIEW_NOTE,'maskMatches':175,'maskTotal':177}
LOCATOR = {'kind':'whole-image','blockId':201,'entryIndex':None,'frameIndex':None,'tileIndex':None,'cellIndex':None}


def reconstruct_sheet(raw,*,glyph_count=177,columns=16,rows=12,scale=8,gap=8,bg=BG,fg=FG,msb_left=True):
    if len(raw) != glyph_count*8 or glyph_count != 177: raise ValueError('Font glyph count/8-byte framing differs')
    if min(columns,rows,scale) < 1 or gap < 0 or columns*rows < glyph_count: raise ValueError('Invalid font sheet layout')
    size = (columns*8*scale+(columns-1)*gap,rows*8*scale+(rows-1)*gap)
    sheet = Image.new('RGB',size,bg)
    # Glyph bytes contain rows; no DAX image header, palette bytes, outer margin or trailing glyph.
    for glyph in range(glyph_count):
        x0,y0 = (glyph%columns)*(8*scale+gap),(glyph//columns)*(8*scale+gap)
        for y in range(8):
            for x in range(8):
                if raw[glyph*8+y] & (128>>x if msb_left else 1<<x):
                    sheet.paste(fg,(x0+x*scale,y0+y*scale,x0+(x+1)*scale,y0+(y+1)*scale))
    return sheet


def decode_font(data):
    if common.sha(data) != ARCHIVE_SHA: raise ValueError('Font archive SHA differs')
    base,blocks = dax_decode.parse_container(data)
    if base != 74 or [b.block_id for b in blocks] != TOC: raise ValueError('Font ordered TOC/data framing differs')
    block = blocks[0]
    if (block.index,block.block_id,block.raw_size,block.comp_size,block.data_offset) != (0,201,1416,1341,0):
        raise ValueError('Font block201 TOC entry/size/offset differs')
    raw = census.strict_rle(data[base:base+block.comp_size],block.raw_size)
    if common.sha(raw) != RAW_SHA: raise ValueError('Font decompressed block SHA differs')
    return raw


def verify_sheet(raw,png):
    if common.sha(png) != SOURCE_SHA: raise ValueError('Font source PNG SHA differs')
    expected = reconstruct_sheet(raw)
    if expected.size != (1144,856) or common.sha(expected.tobytes()) != RGB_SHA: raise ValueError('Font reconstructed full-sheet RGB differs')
    with Image.open(io.BytesIO(png)) as image:
        if image.mode != 'RGB' or image.size != expected.size or image.tobytes() != expected.tobytes():
            raise ValueError('Font complete source image pixels differ')
    return expected


def verify_pair_metadata(pair):
    expected = {'stem':CARD,'platform':'DOS','platforms':['DOS'],'family':'8X8D1 font atlas','families':['8X8D1 font atlas'],
        'source':f'images/{SOURCE_SHA}.png','output':f'images/{OUTPUT_SHA}.png','sourceSha256':SOURCE_SHA,'outputSha256':OUTPUT_SHA,
        'sourceSize':[1144,856],'outputSize':[1144,856],'sourceName':'source_sheet.png',
        'sourceProvenance':'dos/font_block201_source/source_sheet.png','aliases':[ALIAS],
        'ledgerStatuses':['saved-reviewed'],'reviewNotes':[REVIEW_NOTE],'compositionReview':'not-reviewed',
        'runtimeApproved':False,'runtimeApprovalEvidence':[],'animations':[],'promptReferences':[],
        'prompt':'unknown (not recorded or exact source/output mapping unavailable)'}
    if pair.get('id') != CARD or any(pair.get(key) != value for key,value in expected.items()):
        raise ValueError('Font source/output/alias/status contract differs')


def package_file(root,relative,context):
    """Resolve a gallery-relative file without following links outside its package root."""
    if not isinstance(relative,str) or not relative.strip():
        raise ValueError(f'{context}: package path must be a nonempty relative file path')
    candidate = Path(relative)
    parts = relative.replace('\\','/').split('/')
    if candidate.is_absolute() or candidate.drive or any(part in {'','.','..'} for part in parts):
        raise ValueError(f'{context}: package path must be a clean relative file path: {relative!r}')
    base = root.resolve(strict=True)
    path = (base/relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f'{context}: path escapes approved root: {path}')
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def verify_pair(manifest,package):
    hits = [row for row in manifest.get('assets',[]) if row.get('id') == CARD]
    if len(hits) != 1: raise ValueError('Font exact gallery card missing/duplicate')
    pair = hits[0]; verify_pair_metadata(pair)
    for side,pin in [('source',SOURCE_SHA),('output',OUTPUT_SHA)]:
        path = package_file(package,pair[side],f'Font packaged {side}')
        if common.sha(path.read_bytes()) != pin: raise ValueError(f'Font packaged {side} SHA differs')
    return copy.deepcopy(pair)


def build_inputs(root=ROOT,source_root=SOURCE_ROOT,package=PACKAGE):
    data = (root/'Champions of Krynn/8X8D1.DAX').read_bytes(); raw = decode_font(data)
    ledger_bytes = (source_root/'dos_font_coverage.json').read_bytes()
    if common.sha(ledger_bytes) != LEDGER_SHA: raise ValueError('Font ledger SHA differs')
    ledger = json.loads(ledger_bytes)
    if (ledger.get('source_sha256'),ledger.get('source_block'),ledger.get('source_payload_bytes'),ledger.get('glyph_count'),
            ledger.get('layout'),ledger.get('output_size'),ledger.get('status')) != (
            ARCHIVE_SHA,201,1416,177,'16 columns x 12 rows; final 15 cells empty',[1144,856],'saved-reviewed'):
        raise ValueError('Font ledger source/layout/status differs')
    source_path = source_root/'dos/font_block201_source/source_sheet.png'
    output_path = source_root/'done/CoK_DOS_8X8D1_block201_font_atlas_restyle.png'
    for key,path in [('source_file',root/'Champions of Krynn/8X8D1.DAX'),('source_sheet',source_path),('output',output_path)]:
        if Path(ledger.get(key,'')).resolve() != path.resolve(): raise ValueError('Font ledger exact source/output path differs')
    sheet = verify_sheet(raw,source_path.read_bytes())
    output = output_path.read_bytes()
    if common.sha(output) != OUTPUT_SHA: raise ValueError('Font output PNG SHA differs')
    with Image.open(io.BytesIO(output)) as image:
        if image.size != sheet.size: raise ValueError('Font output PNG size differs')
        output_rgb_sha = common.sha(image.convert('RGB').tobytes())
    manifest_bytes = (package/'manifest.json').read_bytes()
    if common.sha(manifest_bytes) != MANIFEST_SHA: raise ValueError('Font inventory manifest SHA differs')
    pair = verify_pair(json.loads(manifest_bytes),package)
    receipt = {'schema':'cok-dos-font-source-lineage-v1','task':'FONT201-SOURCE-LINEAGE','sourceAssetId':ASSET,'cardId':CARD,
        'archive':{'path':'Champions of Krynn/8X8D1.DAX','sha256':ARCHIVE_SHA,'orderedToc':TOC,'tocEntry':0,
                   'dataBase':74,'compressedBytes':1341,'rawBytes':1416,'blockSha256':RAW_SHA},
        'renderRecipe':{'glyphCount':177,'bytesPerGlyph':8,'bitOrder':'MSB-left','columns':16,'rows':12,'scale':8,
                        'gapPixels':8,'outerMargin':0,'emptyTrailingCells':15,'backgroundRGB':list(BG),'foregroundRGB':list(FG)},
        'sourceSheet':{'sha256':SOURCE_SHA,'width':1144,'height':856,'rgbSha256':RGB_SHA,'completePixelEquality':True},
        'output':{'sha256':OUTPUT_SHA,'rgbSha256':output_rgb_sha,'reviewStatus':'generated','compositionReview':'not-reviewed',
                  'promptStatus':'unknown','pixelEqualityToSource':output_rgb_sha == RGB_SHA},
        'ledgerSha256':LEDGER_SHA,'inventorySha256':MANIFEST_SHA,'exactAlias':ALIAS,
        'attributedOutputReview':{'source':'dos_font_coverage.json + generated inventory alias','maskMatches':175,'maskTotal':177,
                                  'note':REVIEW_NOTE,'recomputedHere':False},
        'limits':['Whole-sheet source lineage, not per-glyph identities, runtime glyph mapping or animation.',
                  'one-to-one sourceRelation identifies lineage; it does not assert source/output pixel equality.',
                  '175/177 is an attributed output-review result, not missing source glyphs or a source-lineage mismatch.',
                  'Composition remains unreviewed, prompt unknown, consumer unknown, animation null; no runtime admission.',
                  'scrn1b remains unlinked. Archive pins identify a local copy, not independent retail provenance.']}
    return receipt,pair


def records(pair):
    verify_pair_metadata(pair)
    evidence = [{'kind':'research-doc','reference':'docs/engine/research/cok-dos-font-source-lineage-v1.json',
                 'note':'All 177 raw glyphs reconstruct the complete source-sheet pixels, including gutters and 15 empty cells. This proves source lineage, not output fidelity or runtime use.'}]
    asset = {'id':ASSET,'game':'cok','edition':'DOS install','platform':'DOS-EGA',
        'archive':{'name':'8X8D1.DAX','path':'Champions of Krynn/8X8D1.DAX','sha256':ARCHIVE_SHA},'locator':copy.deepcopy(LOCATOR),
        'decoded':{'path':pair['source'],'sha256':SOURCE_SHA,'pixelSha256':RGB_SHA,'width':1144,'height':856},
        'identityStatus':'source-pinned','description':{'text':'Whole source-sheet rendering of all 177 stored DOS 8X8D1 block201 glyphs, in archive order; source lineage is exact.',
            'status':'verified','evidence':evidence},'gameConsumers':[{'status':'unknown','use':'Exact screen/glyph consumers and runtime selectors are not established by this source-sheet lineage import.','evidence':evidence}],
        'animationGroupId':None}
    restyle = {'id':RESTYLE,'externalReferences':[{'system':'cok-restyle-inventory-v1','id':CARD,'reference':f'restyle/cok-generated/manifest.json#{CARD}'}],
        'sourceAssetIds':[ASSET],'sourceRelation':'one-to-one','prompt':{'status':'unknown','batch':None,'path':None,'sha256':None,
            'textSha256':None,'inputPath':pair['source'],'inputSha256':SOURCE_SHA,'text':None,'references':[],'referenceAssetIds':[]},
        'outputs':[{'path':pair['output'],'sha256':OUTPUT_SHA,'role':'gallery-copy'}],'reviewStatus':'generated',
        'evidence':evidence+[{'kind':'existing-manifest','reference':f'restyle/cok-generated/manifest.json#{CARD}',
            'note':'Exact source/output hashes and one alias bind lineage. Composition not reviewed; prompt unknown. The ledger reports 175/177 output glyph masks, not source mismatches; no approval promotion.'}]}
    return asset,restyle


def merge_registry(registry,pair):
    incoming,restyle = records(pair); result = copy.deepcopy(registry)
    for rows,key,new,core in [(result['assets'],'id',incoming,['game','edition','platform','archive','locator','decoded','identityStatus']),
                              (result['restyles'],'id',restyle,['sourceAssetIds','sourceRelation','prompt','outputs','reviewStatus','externalReferences'])]:
        hits = [row for row in rows if row.get(key) == new[key]]
        if len(hits) > 1: raise ValueError('Font duplicate existing identity')
        if hits:
            if any(hits[0].get(k) != new[k] for k in core): raise ValueError('Font incompatible existing source/pair pin')
            # Keep prior descriptions, consumers, gallery references, evidence and ancillary metadata.
        else: rows.append(copy.deepcopy(new))
    for row in result['assets']:
        if (row.get('id') != ASSET and row.get('game') == 'cok' and row.get('platform') == 'DOS-EGA'
                and row.get('archive',{}).get('name') == '8X8D1.DAX'
                and all(row.get('locator',{}).get(k) == value for k,value in LOCATOR.items())):
            raise ValueError('Font whole-sheet locator belongs to another identity')
    for row in result['restyles']:
        if row.get('id') != RESTYLE and (any(o.get('sha256') == OUTPUT_SHA for o in row.get('outputs',[]))
                or any(e.get('id') == CARD for e in row.get('externalReferences',[]))):
            raise ValueError('Font exact output/card already belongs to another Restyle record')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--write',action='store_true'); args = parser.parse_args()
    receipt,pair = build_inputs(); registry = json.loads(common.REGISTRY.read_text(encoding='utf-8')); updated = merge_registry(registry,pair)
    errors,warnings = common.graphics_asset_registry.validate(updated)
    if errors: raise ValueError('Registry validation failed: '+'; '.join(errors))
    if args.write:
        common.atomic_json(RECEIPT,receipt); common.atomic_json(common.REGISTRY,updated,validate_registry=True)
    print(json.dumps({'wholeSheetSources':1,'sourceGlyphs':177,'sourcePixelsExact':True,'restylePairs':1,'reviewStatus':'generated',
        'registryChanged':updated != registry,'validationErrors':len(errors),'validationWarnings':len(warnings),'write':args.write},indent=2)); return 0


if __name__ == '__main__': raise SystemExit(main())
