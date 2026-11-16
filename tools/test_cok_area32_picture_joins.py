"""Source-only area32 host boundary, duplicate map, route-scope and preservation controls."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
import cok_area32_picture_joins as m


class Area32PictureJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing inputs fail with their path; never count an empty site list as a success.
        cls.receipt = m.build_receipt()
        cls.registry = json.loads(m.source.REGISTRY.read_text(encoding='utf-8'))

    def test_exact_ten_immediate_sites_witnesses_and_narrow_binding(self):
        self.assertEqual([(row['offset'],row['pictureId']) for row in self.receipt['sites']],m.ROSTER)
        self.assertTrue(all(row['operand']['code'] == 0 and row['operand']['kind'] == 'immediate' for row in self.receipt['sites']))
        bound = [row for row in self.receipt['sites'] if row['siteAssetMapping']]
        self.assertEqual([row['offset'] for row in bound],[3073,5957])
        self.assertTrue(all(row['siteAssetMapping'] == m.ASSET15 and row['entries'] == ['search_location'] for row in bound))
        other = [row for row in self.receipt['sites'] if row['pictureId'] not in (15,255)]
        self.assertEqual(len(other),7)
        self.assertTrue(all(row['siteAssetMapping'] is None and row['status'] == 'site-binding-unresolved' and row['loadedMapCandidate'] for row in other))
        unmapped = self.receipt['sites'][0]
        self.assertEqual(unmapped['pictureId'],255); self.assertIsNone(unmapped['loadedMapCandidate'])
        self.assertEqual(unmapped['status'],'unmapped-immediate'); self.assertNotIn('clearScreen',unmapped)
        self.assertEqual(unmapped['entries'],['search_location','vm_run_1','initial_entry','camp_interrupted'])
        self.assertFalse(self.receipt['issues'])

    def test_source_and_site_mutations_fail_before_enrichment(self):
        for mutation in ['archive','block','missingSite','extraSite','witness','vaddr','entry','255dynamic','non15bound','non15status','history5957','historyRerun','candidate34','frame1','PNGswap','PNGsize']:
            receipt = copy.deepcopy(self.receipt)
            if mutation == 'archive': receipt['eclArchiveSha256'] = '0'*64
            if mutation == 'block': receipt['eclBlockSha256'] = '0'*64
            if mutation == 'missingSite': receipt['sites'].pop()
            if mutation == 'extraSite': receipt['sites'].append(copy.deepcopy(receipt['sites'][0]))
            if mutation == 'witness': receipt['sites'][3]['entryWitnesses'][0]['offsetPathSha256'] = '0'*64
            if mutation == 'vaddr': receipt['sites'][3]['vaddr'] += 1
            if mutation == 'entry': receipt['sites'][3]['entries'] = ['initial_entry']
            if mutation == '255dynamic': receipt['sites'][0]['operand']['code'] = 1
            if mutation == 'non15bound': receipt['sites'][1]['siteAssetMapping'] = m.ASSET15
            if mutation == 'non15status': receipt['sites'][1]['status'] = 'conditional-retained15-initial-mount'
            if mutation == 'history5957': receipt['sites'][8]['historicalRouteOffset'] = 3073
            if mutation == 'historyRerun': receipt['historicalEvidence']['rerun'] = True
            if mutation == 'candidate34': receipt['sites'][7]['loadedMapCandidate']['tocEntry'] = 3
            if mutation == 'frame1': receipt['sourceFrames'][0]['frameIndex'] = 1
            if mutation == 'PNGswap': receipt['pngDistinction']['registryDecodedPNG']['sha256'] = m.RUNTIME_PNG_SHA
            if mutation == 'PNGsize': receipt['pngDistinction']['runtimeNativeSourcePNG']['width'] = 352
            with self.subTest(mutation=mutation),self.assertRaises(ValueError): m.verify_receipt(receipt)

    def test_all_initial_mount_conditions_are_required(self):
        self.assertEqual(m.initial_mount_binding(15),m.ASSET15)
        for changed in [{'game':'dok'},{'disk':2},{'area':33},{'current_state':False},{'current_mount':False},
                        {'available':False},{'has15':False},{'qualifying_menu':False}]:
            with self.subTest(changed=changed): self.assertIsNone(m.initial_mount_binding(15,**changed))
        for picture in [255,62,1,61,63,23,34]: self.assertIsNone(m.initial_mount_binding(picture))
        self.assertTrue(any('previously mounted #15 presentation could render later non15' in text for text in self.receipt['limits']))

    def test_historical_route_scope_and_png_representations_remain_distinct(self):
        self.assertEqual([row['offset'] for row in self.receipt['sites'] if row['historicalRouteOffset'] is not None],[3073])
        self.assertEqual(self.receipt['historicalEvidence']['siteOffset'],3073)
        pngs = self.receipt['pngDistinction']
        self.assertNotEqual(pngs['registryDecodedPNG']['sha256'],pngs['runtimeNativeSourcePNG']['sha256'])
        self.assertEqual([pngs[key]['width'] for key in ['registryDecodedPNG','runtimeNativeSourcePNG']],[352,88])
        self.assertFalse(pngs['runtimeNativeSourcePNG']['pngBytesInspectedInThisSlice'])
        self.assertFalse(pngs['newAdmission'])

    def test_duplicate34_pixel_equality_cannot_erase_entry_identity_or_last_wins(self):
        frames = [row for row in self.receipt['sourceFrames'] if row['blockId'] == 34]
        self.assertEqual([row['tocEntry'] for row in frames],[3,12])
        self.assertEqual(frames[0]['pixelSha256'],frames[1]['pixelSha256'])
        self.assertNotEqual(frames[0]['sourceAssetId'],frames[1]['sourceAssetId'])
        entries = [{'blockId':34,'tocEntry':3},{'blockId':15,'tocEntry':10},{'blockId':34,'tocEntry':12}]
        self.assertEqual(m.last_wins(entries)[34]['tocEntry'],12)
        self.assertEqual(m.last_wins(list(reversed(entries)))[34]['tocEntry'],3)
        self.assertNotIn('cok/dos-ega/disk1/pic1.dax/block/34/frame/0',json.dumps(self.receipt))

    def test_current_gate_preload_decoder_order_and_batched_application_fragments(self):
        texts = {path:(m.ROOT/path).read_text(encoding='utf-8') for path in {row[1] for row in m.HOST}}
        self.assertEqual(m.verify_host(texts),self.receipt['hostSource'])
        edits = [('apps/web/src/ui/explore.ts','pictureId === 15 && state?.cellDialoguePresentation','pictureId !== 15 && state?.cellDialoguePresentation'),
                 ('apps/web/src/ui/explore.ts','currentArea.areaId === 32','currentArea.areaId === 33'),
                 ('apps/web/src/ui/explore.ts','state !== current || mountSeq !== exploreMountSeq || !pictures.has(15)','!pictures.has(15)'),
                 ('apps/web/src/ui/explore.ts','pictures.set(block.blockId, block.image);','if (!pictures.has(block.blockId)) pictures.set(block.blockId, block.image);'),
                 ('packages/engine/src/loaders/dax.ts','blk.image = anim[0];','blk.image = anim[1];'),
                 ('packages/engine/src/world/dialogue.ts','effects.length - 1','0')]
        for path,old,new in edits:
            changed = dict(texts); self.assertIn(old,changed[path]); changed[path] = changed[path].replace(old,new,1)
            with self.subTest(edit=old),self.assertRaises(ValueError): m.verify_host(changed)

    def test_archive_block_decoder_and_duplicate_png_pin_mutations(self):
        data = (m.ROOT/'Champions of Krynn/PIC1.DAX').read_bytes()
        with self.assertRaisesRegex(ValueError,'archive SHA'): m.decode_pic1(data[:-1]+bytes([data[-1]^1]),m.SOURCE_ROOT)
        for entry in [10,3,12]:
            original = m.PINS[entry]
            for index,error in [(2,'block/entry/frame'),(3,'geometry/RGB'),(4,'source PNG')]:
                changed = list(original); changed[index] = '0'*64
                with self.subTest(entry=entry,index=index),patch.dict(m.PINS,{entry:tuple(changed)}):
                    with self.assertRaisesRegex(ValueError,error): m.decode_pic1(data,m.SOURCE_ROOT)
        parse = m.dax_complex_decode.parse_anim_frames
        def bad_duplicate(raw,apply_xor=False):
            frames = parse(raw,apply_xor=apply_xor)
            if m.source.sha(raw) == m.PINS[3][2]:
                frames = copy.deepcopy(frames); pixels = frames[0]['pixels']; frames[0]['pixels'] = bytes([pixels[0]^1])+pixels[1:]
            return frames
        with patch.object(m.dax_complex_decode,'parse_anim_frames',bad_duplicate):
            with self.assertRaisesRegex(ValueError,'geometry/RGB'): m.decode_pic1(data,m.SOURCE_ROOT)

    def test_only_existing15_consumer_is_appended_and_other_rows_edges_statuses_preserved(self):
        before = copy.deepcopy(self.registry); enriched = m.enrich_registry(self.registry,self.receipt)
        self.assertEqual(self.registry,before); self.assertEqual(len(enriched['assets']),len(before['assets']))
        for prior,current in zip(before['assets'],enriched['assets']):
            if prior['id'] != m.ASSET15: self.assertEqual(current,prior); continue
            self.assertEqual({key:value for key,value in current.items() if key != 'gameConsumers'},
                             {key:value for key,value in prior.items() if key != 'gameConsumers'})
            added = [row for row in current['gameConsumers'] if any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual(len(added),1); self.assertEqual(added[0]['status'],'partial')
            old = [row for row in prior['gameConsumers'] if not any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual([row for row in current['gameConsumers'] if row not in added],old)
        for key in set(before)-{'assets'}: self.assertEqual(enriched[key],before[key])
        self.assertEqual(m.enrich_registry(enriched,self.receipt),enriched)
        self.assertFalse(m.source.graphics_asset_registry.validate(enriched)[0])

    def test_registry_locator_source_and_conflicting_consumer_fail_closed(self):
        for mutation in ['missing15','duplicate15','frame1','PNGswap','wrongArchive','archivePin','missing34','entryless34','wrongEntry34','consumer']:
            registry = copy.deepcopy(self.registry); asset = next(row for row in registry['assets'] if row['id'] == m.ASSET15)
            if mutation == 'missing15': registry['assets'].remove(asset)
            if mutation == 'duplicate15': registry['assets'].append(copy.deepcopy(asset))
            if mutation == 'frame1': asset['locator']['frameIndex'] = 1
            if mutation == 'PNGswap': asset['decoded']['sha256'] = m.RUNTIME_PNG_SHA
            if mutation == 'wrongArchive': asset['archive']['name'] = 'PIC2.DAX'
            if mutation == 'archivePin': asset['archive']['sha256'] = '0'*64
            if mutation in ('missing34','entryless34','wrongEntry34'):
                duplicate = next(row for row in registry['assets'] if row['id'] == m.PINS[3][1])
                if mutation == 'missing34': registry['assets'].remove(duplicate)
                if mutation == 'entryless34': duplicate['id'] = 'cok/dos-ega/disk1/pic1.dax/block/34/frame/0'
                if mutation == 'wrongEntry34': duplicate['locator']['entryIndex'] = 12
            if mutation == 'consumer':
                registry = m.enrich_registry(registry,self.receipt)
                next(row for row in registry['assets'] if row['id'] == m.ASSET15)['gameConsumers'][-1]['status'] = 'verified'
            before = copy.deepcopy(registry)
            with self.subTest(mutation=mutation),self.assertRaises(ValueError): m.enrich_registry(registry,self.receipt)
            self.assertEqual(registry,before)

    def test_determinism_unchanged_sources_registry_and_atomic_rejection(self):
        paths = [m.ROOT/'Champions of Krynn'/name for name in ['ECL1.DAX','PIC1.DAX']]+[m.source.REGISTRY]
        before = {str(path):m.source.sha(path.read_bytes()) for path in paths}
        self.assertEqual(m.build_receipt(),self.receipt)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); registry_path = root/'registry.json'; registry_path.write_text(json.dumps(self.registry),encoding='utf-8')
            original = registry_path.read_bytes()
            with self.assertRaisesRegex(FileNotFoundError,'ECL1.DAX'): m.build_receipt(root)
            with patch.object(m,'ROOT',root),patch.object(m.source,'REGISTRY',registry_path),patch.object(m,'build_receipt',return_value=self.receipt), \
                    patch.object(sys,'argv',['cok_area32_picture_joins.py','--write']), \
                    patch.object(m.source.graphics_asset_registry,'validate',return_value=(['synthetic rejection'],[])):
                with self.assertRaisesRegex(ValueError,'validation failed'): m.main()
            self.assertEqual(registry_path.read_bytes(),original); self.assertEqual(list(root.iterdir()),[registry_path])
            with patch.object(m.source.os,'replace',side_effect=OSError('synthetic atomic replacement failure')):
                with self.assertRaisesRegex(OSError,'atomic replacement failure'):
                    m.source.atomic_json(registry_path,self.registry,validate_registry=True)
            self.assertEqual(registry_path.read_bytes(),original); self.assertEqual(list(root.iterdir()),[registry_path])
        self.assertEqual({str(path):m.source.sha(path.read_bytes()) for path in paths},before)


if __name__ == '__main__': unittest.main()
