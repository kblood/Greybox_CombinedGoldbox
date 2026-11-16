"""Standard-library source-only demo joins/composite/registry mutation controls."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
import cok_demo_picture_joins as m


class DemoPictureJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing source fixtures fail explicitly; no silent empty/skip success.
        cls.receipt = m.build_receipt()
        cls.registry = json.loads(m.source.REGISTRY.read_text(encoding='utf-8'))
        _frames,cls.parts = m.decode_sources(m.ROOT,m.SOURCE_ROOT)

    def test_exact_five_sites_and_six_existing_source_frames(self):
        self.assertEqual([(row['offset'],row['pictureId']) for row in self.receipt['sites']],m.ROSTER)
        self.assertEqual(len(self.receipt['sourceFrames']),6)
        self.assertEqual(self.receipt['sourceFrames'][-1]['storedFrames'],8)
        self.assertEqual(self.receipt['composition']['rgbSha256'],m.COMPOSITE_SHA)
        self.assertIsNone(self.receipt['composition']['newCanonicalId'])
        self.assertEqual(self.receipt['sourceFrames'][1]['sourceAssetId'],'cok/dos-ega/disk1/head2.dax/block/69/frame/0')
        self.assertEqual(self.receipt['sourceFrames'][2]['sourceAssetId'],'cok/dos-ega/disk1/body2.dax/block/68/frame/0')

    def test_archive_and_decompressed_source_mutations_fail_closed(self):
        for name,(pin,toc) in m.ARCHIVES.items():
            with self.subTest(archive=name), patch.dict(m.ARCHIVES,{name:('0'*64,toc)}):
                with self.assertRaisesRegex(ValueError,'archive SHA'): m.decode_sources(m.ROOT,m.SOURCE_ROOT)
        for index in range(6):
            changed = list(m.SOURCES); row = list(changed[index]); row[6] = '0'*64; changed[index] = tuple(row)
            with self.subTest(source=index), patch.object(m,'SOURCES',changed):
                with self.assertRaisesRegex(ValueError,'block pin'): m.decode_sources(m.ROOT,m.SOURCE_ROOT)

    def test_ecl_roster_source_and_frame_receipt_mutations_rejected(self):
        for mutation in ['archive','block','missingSite','extraSite','siteID','dynamic','frame1','sourcePNG','sourceRGB','amiga116','PIC1','PIC3','golden','batch']:
            receipt = copy.deepcopy(self.receipt)
            if mutation == 'archive': receipt['eclArchiveSha256'] = '0'*64
            if mutation == 'block': receipt['eclBlockSha256'] = '0'*64
            if mutation == 'missingSite': receipt['sites'].pop()
            if mutation == 'extraSite': receipt['sites'].append(copy.deepcopy(receipt['sites'][0]))
            if mutation == 'siteID': receipt['sites'][0]['pictureId'] = 23
            if mutation == 'dynamic': receipt['sites'][0]['operand']['code'] = 1
            if mutation == 'frame1': receipt['sourceFrames'][-1]['frameIndex'] = 1
            if mutation == 'sourcePNG': receipt['sourceFrames'][0]['pngSha256'] = '0'*64
            if mutation == 'sourceRGB': receipt['sourceFrames'][0]['pixelSha256'] = '0'*64
            if mutation == 'amiga116': receipt['sourceFrames'][3]['sourceAssetId'] = 'cok/amiga/disk2/bigpic1.daa/block/116/frame/0'
            if mutation in ('PIC1','PIC3'): receipt['sourceFrames'][-1]['sourceAssetId'] = f'cok/dos-ega/disk{mutation[-1]}/{mutation.lower()}.dax/block/23/frame/0'
            if mutation == 'golden': receipt['composition']['rgbSha256'] = '0'*64
            if mutation == 'batch': receipt['batchContract']['demoPictureBeatOrder'] = [23]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.verify_receipt(receipt)

    def test_first_wins_collision_and_complete_composite_override(self):
        earlier = {23:'PIC2 source',68:'earlier decoded68'}; later = {23:'BIGPIC collision',116:'BIGPIC116'}
        merged = m.first_wins([earlier,later])
        self.assertEqual(merged[23],'PIC2 source')
        self.assertEqual(m.first_wins([later,earlier])[23],'BIGPIC collision')
        result,complete = m.apply_composite(merged,self.parts)
        self.assertTrue(complete); self.assertEqual(m.source.sha(result[68]),m.COMPOSITE_SHA)
        self.assertEqual(merged[68],'earlier decoded68')
        self.assertEqual(result[23],'PIC2 source')
        missing,complete = m.apply_composite(merged,[self.parts[0],None])
        self.assertFalse(complete); self.assertEqual(missing,merged)
        self.assertFalse(m.compose_parts([])['complete'])

    def test_composite_reversed_missing_placement_geometry_pixels_frame_mask_controls(self):
        for mutation in ['reverse','placement','geometry','pixel','frame1','mask','maskMissing']:
            parts = copy.deepcopy(self.parts)
            if mutation == 'reverse': parts.reverse()
            if mutation == 'placement': parts[1]['y'] = 39
            if mutation == 'geometry': parts[1]['geometry'][1] = 47
            if mutation == 'pixel': parts[0]['rgb'] = bytes([parts[0]['rgb'][0]^1])+parts[0]['rgb'][1:]
            if mutation == 'frame1': parts[0]['frameIndex'] = 1
            if mutation == 'mask': parts[0]['transparentIndex'] = 0
            if mutation == 'maskMissing': del parts[0]['transparentIndex']
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError,'composite'): m.compose_parts(parts)
        with patch.object(m,'COMPOSITE_SHA','0'*64):
            with self.assertRaisesRegex(ValueError,'golden'): m.compose_parts(self.parts)

    def test_current_profile_first_wins_composite_apply_and_mode_fragments_guarded(self):
        texts = {path:(m.ROOT/path).read_text(encoding='utf-8') for path in {row[1] for row in m.HOST}}
        self.assertEqual(m.verify_host(texts),self.receipt['hostSource'])
        mutations = [
            ('apps/web/src/ui/demo.ts',"'Champions of Krynn/PIC2.DAX'","'Champions of Krynn/PIC1.DAX'"),
            (m.DEMO,'!block.image || pictures.has(block.blockId)','!block.image'),
            (m.DEMO,'if (complete) {','if (true) {'),
            (m.DEMO,'part.x, part.y','part.y, part.x'),
            (m.DEMO,'state.currentPictureFrame = 0','state.currentPictureFrame = 1'),
            (m.DEMO,"beats.push({ kind: 'picture', pictureId: e.id });","beats.push({ kind: 'picture', pictureId: 23 });"),
            (m.DEMO,"mode === 'Restyle'","mode === 'DOS-EGA'"),
            ('packages/engine/src/loaders/dax.ts',"        transparentIndex: null,\n        palette: egaPalette,\n        encoding: 'dax-frame',",
             "        transparentIndex: 0,\n        palette: egaPalette,\n        encoding: 'dax-frame',"),
            ('packages/engine/src/loaders/dax.ts','bestMiss <= 2','bestMiss <= 200'),
        ]
        for path,old,new in mutations:
            changed = dict(texts); self.assertIn(old,changed[path]); changed[path] = changed[path].replace(old,new,1)
            with self.subTest(mutation=old), self.assertRaises(ValueError): m.verify_host(changed)

    def test_demo_beats_are_not_dialogue_last_picture_or_visible_scene_count(self):
        contract = m.batch_contract([70,68])
        self.assertEqual(contract['demoPictureBeatOrder'],[70,68]); self.assertEqual(contract['dialogueRunnerLastPicture'],68)
        self.assertFalse(contract['sameConsumer']); self.assertIsNone(contract['visibleSceneCount'])
        self.assertEqual(m.source_candidates(23)['initialFrame'],0)
        self.assertEqual(m.source_candidates(68)['sourceAssetIds'],[m.SOURCES[1][0],m.SOURCES[2][0]])

    def test_non_dos_failure_unavailable_and_other_profile_do_not_gain_binding(self):
        for mode,available,profile in [('Amiga',True,'cok-demo-ecl2-57'),('Restyle',True,'cok-demo-ecl2-57'),
                ('DOS-EGA',False,'cok-demo-ecl2-57'),('DOS-EGA',True,'other-profile')]:
            binding = m.source_candidates(116,mode,available,profile)
            self.assertEqual(binding['sourceAssetIds'],[]); self.assertIsNone(binding['initialFrame'])
            self.assertIn('unresolved',binding['status'])

    def test_only_six_existing_rows_gain_partial_evidence_all_old_metadata_preserved(self):
        registry = copy.deepcopy(self.registry); owned = {row[0] for row in m.SOURCES}
        for row in registry['assets']:
            if row['id'] in owned: row['customMetadata'] = {'keep':[1,2]}
        before = copy.deepcopy(registry); result = m.enrich_registry(registry,self.receipt)
        self.assertEqual(registry,before); self.assertEqual(len(result['assets']),len(registry['assets']))
        for prior,current in zip(registry['assets'],result['assets']):
            if prior['id'] not in owned: self.assertEqual(current,prior); continue
            self.assertEqual({key:value for key,value in current.items() if key != 'gameConsumers'},
                             {key:value for key,value in prior.items() if key != 'gameConsumers'})
            added = [row for row in current['gameConsumers'] if any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual(len(added),1); self.assertEqual(added[0]['status'],'partial')
            old = [row for row in prior['gameConsumers'] if not any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual([row for row in current['gameConsumers'] if row not in added],old)
        for key in set(registry)-{'assets'}: self.assertEqual(result[key],registry[key])
        self.assertEqual(m.enrich_registry(result,self.receipt),result)
        self.assertFalse(m.source.graphics_asset_registry.validate(result)[0])

    def test_registry_missing_duplicate_wrong_bank_legacy_frame_pin_and_status_conflicts(self):
        for mutation in ['missing','duplicate','bank','legacyRename','frame1','PNG','RGB','consumer']:
            registry = copy.deepcopy(self.registry); asset = next(row for row in registry['assets'] if row['id'] == m.SOURCES[1][0])
            if mutation == 'missing': registry['assets'].remove(asset)
            if mutation == 'duplicate': registry['assets'].append(copy.deepcopy(asset))
            if mutation == 'bank': asset['archive']['name'] = 'HEAD3.DAX'
            if mutation == 'legacyRename': asset['id'] = asset['id'].replace('/disk1/','/disk2/')
            if mutation == 'frame1': asset['locator']['frameIndex'] = 1
            if mutation == 'PNG': asset['decoded']['sha256'] = '0'*64
            if mutation == 'RGB': asset['decoded']['pixelSha256'] = '0'*64
            if mutation == 'consumer':
                registry = m.enrich_registry(registry,self.receipt)
                consumers = next(row for row in registry['assets'] if row['id'] == m.SOURCES[1][0])['gameConsumers']
                owned = next(row for row in consumers if any(e.get('reference') == m.RECEIPT for e in row['evidence']))
                owned['status'] = 'verified'
            before = copy.deepcopy(registry)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.enrich_registry(registry,self.receipt)
            self.assertEqual(registry,before)

    def test_deterministic_receipt_sources_and_registry_unchanged_on_failed_validation(self):
        paths = [m.ROOT/'Champions of Krynn'/name for name in ['ECL2.DAX',*m.ARCHIVES]]+[m.source.REGISTRY]
        before = {str(path):m.source.sha(path.read_bytes()) for path in paths}
        self.assertEqual(m.build_receipt(),self.receipt)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); registry_path = root/'registry.json'; registry_path.write_text(json.dumps(self.registry),encoding='utf-8')
            original = registry_path.read_bytes()
            with patch.object(m,'ROOT',root),patch.object(m.source,'REGISTRY',registry_path),patch.object(m,'build_receipt',return_value=self.receipt), \
                    patch.object(sys,'argv',['cok_demo_picture_joins.py','--write']), \
                    patch.object(m.source.graphics_asset_registry,'validate',return_value=(['synthetic rejection'],[])):
                with self.assertRaisesRegex(ValueError,'validation failed'): m.main()
            self.assertEqual(registry_path.read_bytes(),original); self.assertEqual(list(root.iterdir()),[registry_path])
        self.assertEqual({str(path):m.source.sha(path.read_bytes()) for path in paths},before)


if __name__ == '__main__': unittest.main()
