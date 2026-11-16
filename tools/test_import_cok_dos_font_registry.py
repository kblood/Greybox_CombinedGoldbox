"""Source-sheet lineage, exact card join and non-promoting registry import controls."""
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parent))
import import_cok_dos_font_registry as m


class FontRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.receipt,cls.pair = m.build_inputs()
        cls.archive = (m.ROOT/'Champions of Krynn/8X8D1.DAX').read_bytes()
        cls.raw = m.decode_font(cls.archive)
        cls.png = (m.SOURCE_ROOT/'dos/font_block201_source/source_sheet.png').read_bytes()

    @staticmethod
    def empty(): return {'registryVersion':1,'assets':[],'restyles':[],'animationGroups':[],'crossVersionLinks':[]}

    def test_complete_177_glyph_source_sheet_and_whole_locator(self):
        image = m.verify_sheet(self.raw,self.png)
        self.assertEqual(len(self.raw),177*8); self.assertEqual(image.size,(1144,856))
        self.assertEqual(m.common.sha(image.tobytes()),m.RGB_SHA)
        with Image.open(io.BytesIO(self.png)) as source:
            self.assertEqual(source.tobytes(),image.tobytes())
        asset,restyle = m.records(self.pair)
        self.assertEqual(asset['id'],m.ASSET); self.assertEqual(asset['locator'],m.LOCATOR)
        self.assertEqual(asset['locator']['kind'],'whole-image')
        self.assertTrue(all(asset['locator'][key] is None for key in ['entryIndex','frameIndex','tileIndex','cellIndex']))
        self.assertEqual(asset['gameConsumers'][0]['status'],'unknown'); self.assertIsNone(asset['animationGroupId'])
        self.assertEqual(restyle['sourceAssetIds'],[m.ASSET]); self.assertEqual(restyle['sourceRelation'],'one-to-one')

    def test_archive_order_entry_raw_count_and_hash_mutations(self):
        with self.assertRaisesRegex(ValueError,'archive SHA'): m.decode_font(self.archive[:-1]+bytes([self.archive[-1]^1]))
        base,blocks = m.dax_decode.parse_container(self.archive)
        for mutation in ['toc','entry','block','raw','compressed','offset']:
            changed = copy.deepcopy(blocks)
            if mutation == 'toc': changed.reverse()
            if mutation == 'entry': changed[0].index = 1
            if mutation == 'block': changed[0].block_id = 202
            if mutation == 'raw': changed[0].raw_size = 1408
            if mutation == 'compressed': changed[0].comp_size = 1340
            if mutation == 'offset': changed[0].data_offset = 1
            with self.subTest(mutation=mutation),patch.object(m.dax_decode,'parse_container',return_value=(base,changed)):
                with self.assertRaises(ValueError): m.decode_font(self.archive)
        with patch.object(m,'RAW_SHA','0'*64):
            with self.assertRaisesRegex(ValueError,'decompressed block SHA'): m.decode_font(self.archive)
        with patch.object(m.census,'strict_rle',return_value=self.raw[:-8]):
            with self.assertRaisesRegex(ValueError,'decompressed block SHA'): m.decode_font(self.archive)
        with patch.object(m,'ARCHIVE_SHA','0'*64):
            with self.assertRaisesRegex(ValueError,'archive SHA'): m.decode_font(self.archive)

    def test_glyph_swap_count_bit_order_color_spacing_and_margin_controls(self):
        other = next(i for i in range(1,177) if self.raw[i*8:(i+1)*8] != self.raw[:8])
        changed = bytearray(self.raw); changed[:8],changed[other*8:(other+1)*8] = changed[other*8:(other+1)*8],changed[:8]
        with self.assertRaisesRegex(ValueError,'full-sheet RGB'): m.verify_sheet(bytes(changed),self.png)
        for raw,count in [(self.raw[:-8],177),(self.raw+b'\0'*8,177),(self.raw,176)]:
            with self.assertRaisesRegex(ValueError,'glyph count'): m.reconstruct_sheet(raw,glyph_count=count)
        for options in [{'msb_left':False},{'fg':(234,222,189)},{'bg':(32,28,41)},{'scale':7},{'gap':7},{'columns':15,'rows':12}]:
            wrong = m.reconstruct_sheet(self.raw,**options)
            with self.subTest(options=options),patch.object(m,'reconstruct_sheet',return_value=wrong):
                with self.assertRaisesRegex(ValueError,'full-sheet RGB'): m.verify_sheet(self.raw,self.png)
        margin = Image.new('RGB',(1146,858),m.BG); margin.paste(m.reconstruct_sheet(self.raw),(1,1))
        with patch.object(m,'reconstruct_sheet',return_value=margin):
            with self.assertRaisesRegex(ValueError,'full-sheet RGB'): m.verify_sheet(self.raw,self.png)

    def test_every_gap_trailing_cell_and_last_pixel_are_compared(self):
        # Override only the input file hash so full pixel equality remains a discriminating gate.
        for coordinate in [(64,0),(0,64),(80,800),(1143,855),(0,0)]:
            with Image.open(io.BytesIO(self.png)) as source: changed = source.copy()
            changed.putpixel(coordinate,(1,2,3)); stream = io.BytesIO(); changed.save(stream,format='PNG'); png = stream.getvalue()
            with self.subTest(coordinate=coordinate),patch.object(m,'SOURCE_SHA',m.common.sha(png)):
                with self.assertRaisesRegex(ValueError,'complete source image pixels'): m.verify_sheet(self.raw,png)
        with self.assertRaisesRegex(ValueError,'source PNG SHA'): m.verify_sheet(self.raw,self.png+b'x')

    def test_exact_manifest_pair_alias_and_review_metadata_controls(self):
        self.assertEqual(m.verify_pair({'assets':[self.pair]},m.PACKAGE),self.pair)
        mutations = [('id','other'),('sourceSha256','0'*64),('outputSha256','0'*64),('source','../source.png'),
                     ('output','images/wrong.png'),('sourceSize',[1144,855]),('sourceName','other.png'),
                     ('sourceProvenance','other/source_sheet.png'),('platform','Amiga'),('compositionReview','reviewed'),
                     ('runtimeApproved',True),('promptReferences',[{'file':'invented'}]),('ledgerStatuses',['generated'])]
        for key,value in mutations:
            pair = copy.deepcopy(self.pair); pair[key] = value
            with self.subTest(key=key),self.assertRaises(ValueError): m.verify_pair({'assets':[pair]},m.PACKAGE)
            with self.subTest(mergeKey=key),self.assertRaises(ValueError): m.merge_registry(self.empty(),pair)
        for key,value in [('asset',202),('entry',1),('ledgerKind','dos-tile-alias'),('family','8X8D2'),
                          ('platform','Amiga'),('sourceProvenance','elsewhere'),('maskMatches',177)]:
            pair = copy.deepcopy(self.pair); pair['aliases'][0][key] = value
            with self.subTest(alias=key),self.assertRaises(ValueError): m.verify_pair({'assets':[pair]},m.PACKAGE)
        for aliases in [[],[self.pair['aliases'][0],self.pair['aliases'][0]]]:
            pair = copy.deepcopy(self.pair); pair['aliases'] = aliases
            with self.assertRaises(ValueError): m.verify_pair({'assets':[pair]},m.PACKAGE)
        for assets in [[],[self.pair,self.pair]]:
            with self.assertRaisesRegex(ValueError,'card missing/duplicate'): m.verify_pair({'assets':assets},m.PACKAGE)

    def test_package_missing_and_wrong_source_output_bytes_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory); (package/'images').mkdir()
            with self.assertRaisesRegex(ValueError,'source unavailable'): m.verify_pair({'assets':[self.pair]},package)
            source = package/self.pair['source']; source.write_bytes(self.png)
            with self.assertRaisesRegex(ValueError,'output unavailable'): m.verify_pair({'assets':[self.pair]},package)
            output = package/self.pair['output']; output.write_bytes(b'wrong')
            with self.assertRaisesRegex(ValueError,'output SHA'): m.verify_pair({'assets':[self.pair]},package)
            output.write_bytes((m.PACKAGE/self.pair['output']).read_bytes()); source.write_bytes(b'wrong')
            with self.assertRaisesRegex(ValueError,'source SHA'): m.verify_pair({'assets':[self.pair]},package)

    def test_generated_review_status_is_not_promoted_by_attributed_output_masks(self):
        asset,restyle = m.records(self.pair)
        self.assertEqual(restyle['reviewStatus'],'generated'); self.assertEqual(restyle['prompt']['status'],'unknown')
        self.assertEqual(self.receipt['output']['compositionReview'],'not-reviewed')
        self.assertFalse(self.receipt['output']['pixelEqualityToSource'])
        self.assertEqual(self.receipt['attributedOutputReview']['maskMatches'],175)
        self.assertEqual(self.receipt['attributedOutputReview']['maskTotal'],177)
        self.assertFalse(self.receipt['attributedOutputReview']['recomputedHere'])
        self.assertEqual(self.receipt['renderRecipe']['glyphCount'],177)
        self.assertFalse(any(row['relation'] == 'pixel-identical' for row in m.merge_registry(self.empty(),self.pair)['crossVersionLinks']))

    def test_synthetic_enriched_reimport_is_idempotent_preserving_and_nonmutating(self):
        registry = m.merge_registry(self.empty(),self.pair)
        registry['assets'][0]['customMetadata'] = {'retained':True}
        registry['assets'][0]['description']['visualDescription'] = 'Later annotated source'
        registry['assets'][0]['gameConsumers'].append({'status':'partial','use':'independent evidence','evidence':[]})
        registry['restyles'][0]['customMetadata'] = {'review':'kept'}
        registry['restyles'][0]['evidence'].append({'kind':'research-doc','reference':'other'})
        before = copy.deepcopy(registry); updated = m.merge_registry(registry,self.pair)
        self.assertEqual(registry,before); self.assertEqual(updated,before); self.assertIsNot(updated,registry)

    def test_synthetic_source_pair_and_locator_conflicts_reject_without_mutation(self):
        initial = m.merge_registry(self.empty(),self.pair)
        for mutation in ['sourceHash','archive','locator','dimensions','pixelHash','pairSource','pairOutput','pairReview',
                         'pairPrompt','pairRelation','sourceDuplicate','pairDuplicate','otherLocator','otherLocatorMissingNull','otherOutput','otherCard']:
            registry = copy.deepcopy(initial); asset = registry['assets'][0]; pair = registry['restyles'][0]
            if mutation == 'sourceHash': asset['decoded']['sha256'] = '0'*64
            if mutation == 'archive': asset['archive']['sha256'] = '0'*64
            if mutation == 'locator': asset['locator']['tileIndex'] = 0
            if mutation == 'dimensions': asset['decoded']['width'] = 8
            if mutation == 'pixelHash': asset['decoded']['pixelSha256'] = '0'*64
            if mutation == 'pairSource': pair['sourceAssetIds'] = ['other']
            if mutation == 'pairOutput': pair['outputs'][0]['sha256'] = '0'*64
            if mutation == 'pairReview': pair['reviewStatus'] = 'visually-reviewed'
            if mutation == 'pairPrompt': pair['prompt']['status'] = 'missing'
            if mutation == 'pairRelation': pair['sourceRelation'] = 'shared-output'
            if mutation == 'sourceDuplicate': registry['assets'].append(copy.deepcopy(asset))
            if mutation == 'pairDuplicate': registry['restyles'].append(copy.deepcopy(pair))
            if mutation in ('otherLocator','otherLocatorMissingNull'):
                other = copy.deepcopy(asset); other['id'] = 'other'
                if mutation == 'otherLocatorMissingNull': del other['locator']['entryIndex']
                registry['assets'].append(other)
            if mutation in ('otherOutput','otherCard'):
                other = copy.deepcopy(pair); other['id'] = 'other'
                if mutation == 'otherCard': other['outputs'] = []
                registry['restyles'].append(other)
            before = copy.deepcopy(registry)
            with self.subTest(mutation=mutation),self.assertRaises(ValueError): m.merge_registry(registry,self.pair)
            self.assertEqual(registry,before)

    def test_real_registry_preserves_all_existing_rows_groups_links_and_scrn1b(self):
        registry = json.loads(m.common.REGISTRY.read_text(encoding='utf-8')); before = copy.deepcopy(registry)
        updated = m.merge_registry(registry,self.pair)
        self.assertEqual(registry,before)
        self.assertEqual([a for a in updated['assets'] if a['id'] != m.ASSET],[a for a in before['assets'] if a['id'] != m.ASSET])
        self.assertEqual([a for a in updated['restyles'] if a['id'] != m.RESTYLE],[a for a in before['restyles'] if a['id'] != m.RESTYLE])
        for key in set(registry)-{'assets','restyles'}: self.assertEqual(updated[key],before[key])
        self.assertFalse(m.common.graphics_asset_registry.validate(updated)[0])

    def test_input_determinism_pins_missing_prerequisites_and_atomic_failure(self):
        paths = [m.common.REGISTRY,m.ROOT/'Champions of Krynn/8X8D1.DAX',m.SOURCE_ROOT/'dos_font_coverage.json',
                 m.SOURCE_ROOT/'dos/font_block201_source/source_sheet.png',m.SOURCE_ROOT/'done/CoK_DOS_8X8D1_block201_font_atlas_restyle.png',
                 m.PACKAGE/'manifest.json',m.PACKAGE/self.pair['source'],m.PACKAGE/self.pair['output']]
        before = {str(p):m.common.sha(p.read_bytes()) for p in paths}
        self.assertEqual(m.build_inputs(),(self.receipt,self.pair))
        for field,message in [('LEDGER_SHA','ledger SHA'),('MANIFEST_SHA','manifest SHA'),('OUTPUT_SHA','output PNG SHA')]:
            with patch.object(m,field,'0'*64),self.assertRaisesRegex(ValueError,message): m.build_inputs()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(FileNotFoundError,'8X8D1.DAX'): m.build_inputs(root=root)
            registry_path = root/'registry.json'; registry_path.write_text(json.dumps(self.empty()),encoding='utf-8')
            receipt_path = root/'receipt.json'; receipt_path.write_bytes(b'original receipt')
            registry_bytes = registry_path.read_bytes()
            with patch.object(m.common,'REGISTRY',registry_path),patch.object(m,'RECEIPT',receipt_path), \
                    patch.object(m,'build_inputs',return_value=(self.receipt,self.pair)),patch.object(sys,'argv',['font','--write']), \
                    patch.object(m.common.graphics_asset_registry,'validate',return_value=(['synthetic rejection'],[])):
                with self.assertRaisesRegex(ValueError,'validation failed'): m.main()
            self.assertEqual(registry_path.read_bytes(),registry_bytes); self.assertEqual(receipt_path.read_bytes(),b'original receipt')
            with patch.object(m.common.os,'replace',side_effect=OSError('synthetic replacement failure')):
                with self.assertRaisesRegex(OSError,'replacement failure'): m.common.atomic_json(registry_path,self.empty(),validate_registry=True)
            self.assertEqual(registry_path.read_bytes(),registry_bytes)
            self.assertEqual(sorted(p.name for p in root.iterdir()),['receipt.json','registry.json'])
        self.assertEqual({str(p):m.common.sha(p.read_bytes()) for p in paths},before)


if __name__ == '__main__': unittest.main()
