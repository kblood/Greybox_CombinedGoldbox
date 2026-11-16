"""Focused source-only travel joins and preservation controls; no engine/browser execution."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
import cok_travel_picture_joins as m


class TravelPictureJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing prerequisites raise explicit path-bearing errors, never an empty passing roster.
        cls.receipt = m.build_receipt()
        cls.registry = json.loads(m.source.REGISTRY.read_text(encoding='utf-8'))

    def test_exact_seven_immediate_sites_entries_and_witness_pin(self):
        sites = self.receipt['sites']
        self.assertEqual([(row['offset'],row['pictureId']) for row in sites],m.ROSTER)
        self.assertTrue(all(row['operand'] == {'kind':'immediate','code':0,'value':row['pictureId']} for row in sites))
        self.assertEqual(sites[0]['entries'],['initial_entry'])
        self.assertTrue(all(row['entries'] == ['search_location'] for row in sites[1:]))
        self.assertIsNone(sites[0]['binding']['sourceAssetId'])
        self.assertEqual(sites[1]['binding'],{'status':'existing-114-evidence-preserved','sourceAssetId':m.source.ASSET_ID})
        self.assertFalse(self.receipt['issues']); self.assertFalse(self.receipt['directMapPaintingProvesInitialEntry'])
        m.verify_receipt(self.receipt)

    def test_exact_receipt_roster_witness_operand_source_and_host_mutations(self):
        for mutation in ['archive','block','offset','missing','duplicate','entry','witness','vaddr','dynamic','initialBound',
                         'sourceBank','raw','rgb','png','geometry','frame1','host','order','directPaint','batchScenes','issues']:
            receipt = copy.deepcopy(self.receipt)
            if mutation == 'archive': receipt['ecl']['archiveSha256'] = '0'*64
            if mutation == 'block': receipt['ecl']['blockSha256'] = '0'*64
            if mutation == 'offset': receipt['sites'][2]['offset'] += 1
            if mutation == 'missing': receipt['sites'].pop()
            if mutation == 'duplicate': receipt['sites'].append(copy.deepcopy(receipt['sites'][0]))
            if mutation == 'entry': receipt['sites'][0]['entries'] = ['search_location']
            if mutation == 'witness': receipt['sites'][2]['entryWitnesses'][0]['branchEdgesSha256'] = '0'*64
            if mutation == 'vaddr': receipt['sites'][2]['vaddr'] += 1
            if mutation == 'dynamic': receipt['sites'][2]['operand']['code'] = 1
            if mutation == 'initialBound': receipt['sites'][0]['binding'] = m.binding({'kind':'immediate','code':0,'value':121},'search_location')
            if mutation == 'sourceBank': receipt['sourceFrames'][0]['archive'] = 'BIGPIC2.DAX'
            if mutation == 'raw': receipt['sourceFrames'][1]['blockSha256'] = '0'*64
            if mutation == 'rgb': receipt['sourceFrames'][2]['pixelSha256'] = '0'*64
            if mutation == 'png': receipt['sourceFrames'][0]['pngSha256'] = '0'*64
            if mutation == 'geometry': receipt['sourceFrames'][0]['geometry'][0] = 88
            if mutation == 'frame1': receipt['sourceFrames'][0]['frameIndex'] = 1
            if mutation == 'host': receipt['hostSource'][0]['sha256'] = '0'*64
            if mutation == 'order': receipt['mapContract']['order'].reverse()
            if mutation == 'directPaint': receipt['directMapPaintingProvesInitialEntry'] = True
            if mutation == 'batchScenes': receipt['groupedBatchExample']['sceneCount'] = 3
            if mutation == 'issues': receipt['issues'] = [{'reason':'unresolved'}]
            with self.subTest(mutation=mutation),self.assertRaises(ValueError): m.verify_receipt(receipt)

    def test_movement_context_is_required_and_initial_or_unknown_callers_never_promoted(self):
        for picture in m.PINS:
            operand = {'kind':'immediate','code':0,'value':picture}
            self.assertEqual(m.binding(operand,'search_location')['sourceAssetId'],m.asset_id(picture))
            for changed in [{'game':'dok'},{'context':False},{'current_mount':False},{'assets':False},{'presentation':False}]:
                with self.subTest(picture=picture,changed=changed):
                    self.assertIsNone(m.binding(operand,'search_location',**changed)['sourceAssetId'])
            for entry in ['initial_entry','vm_run_1','unknown']:
                self.assertIsNone(m.binding(operand,entry)['sourceAssetId'])
            for origin in ['coordinate-choice','supplied','unknown','text-only','direct-map-paint']:
                self.assertIsNone(m.binding(operand,'search_location',origin)['sourceAssetId'])
            dynamic = {'kind':'dynamic','code':1,'value':picture}
            self.assertIsNone(m.binding(dynamic,'search_location')['sourceAssetId'])

    def test_order_collision_duplicate_missing_and_frame0_controls(self):
        self.assertEqual(m.map_contract(m.throtl.PIC_TOC,m.throtl.BIGPIC_TOC),self.receipt['mapContract'])
        for pic,big in [(m.throtl.PIC_TOC+[121],m.throtl.BIGPIC_TOC),
                        (m.throtl.PIC_TOC,m.throtl.BIGPIC_TOC+[18]),
                        (m.throtl.PIC_TOC+[58],m.throtl.BIGPIC_TOC),
                        ([n for n in m.throtl.PIC_TOC if n != 18],m.throtl.BIGPIC_TOC),
                        (m.throtl.PIC_TOC,[n for n in m.throtl.BIGPIC_TOC if n != 121])]:
            with self.assertRaises(ValueError): m.map_contract(pic,big)
        with self.assertRaises(ValueError): m.map_contract(m.throtl.PIC_TOC,m.throtl.BIGPIC_TOC,order=['PIC1.DAX','BIGPIC1.DAX'])
        with self.assertRaises(ValueError): m.map_contract(m.throtl.PIC_TOC,m.throtl.BIGPIC_TOC,frame=1)

    def test_current_movement_search_map_frame0_and_application_fragments(self):
        texts = {path:(m.ROOT/path).read_text(encoding='utf-8') for path in {row[1] for row in m.HOST}}
        self.assertEqual(m.verify_host(texts),self.receipt['hostSource'])
        edits = [('apps/web/src/ui/explore.ts','const runner = dialogueForCell(block16, 0, {','const runner = dialogueForCell(block16, 1, {'),
                 ('apps/web/src/ui/explore.ts',"[[bigpicBytes, 'BIGPIC1.DAX'], [picBytes, 'PIC1.DAX']]","[[picBytes, 'PIC1.DAX'], [bigpicBytes, 'BIGPIC1.DAX']]"),
                 ('packages/engine/src/world/dungeonEvents.ts','const { searchLocation } = parseEclHeader(block, dialect);','const { vmRun1: searchLocation } = parseEclHeader(block, dialect);'),
                 ('packages/engine/src/loaders/dax.ts','blk.image = anim[0];','blk.image = anim[1];'),
                 ('packages/engine/src/world/dialogue.ts','effects.length - 1','0'),
                 ('apps/web/src/ui/dialogue.ts','state.presentation.pictures.get(pictureId)','state.presentation.pictures.get(121)')]
        for path,old,new in edits:
            changed = dict(texts); self.assertIn(old,changed[path])
            # The same runner spelling occurs in unrelated helpers. Mutate the pinned fragment.
            if path.endswith('explore.ts') and old.startswith('const runner'):
                start = changed[path].index(next(row[2] for row in m.HOST if row[0] == 'movement'))
                changed[path] = changed[path][:start]+changed[path][start:].replace(old,new,1)
            else: changed[path] = changed[path].replace(old,new,1)
            with self.subTest(edit=old),self.assertRaises(ValueError): m.verify_host(changed)

    def test_actual_archive_block_rgb_geometry_and_existing_png_mutations(self):
        pic = (m.ROOT/'Champions of Krynn/PIC1.DAX').read_bytes(); big = (m.ROOT/'Champions of Krynn/BIGPIC1.DAX').read_bytes()
        for p,b in [(pic[:-1]+bytes([pic[-1]^1]),big),(pic,big[:-1]+bytes([big[-1]^1]))]:
            with self.assertRaisesRegex(ValueError,'archive SHA'): m.decode_sources(p,b)
        for picture in m.PINS:
            for key,error in [('blockSha256','block pin'),('pixelSha256','geometry/RGB'),('pngSha256','PNG pin'),('geometry','geometry/RGB')]:
                value = [88,88,1,0] if key == 'geometry' else '0'*64
                with self.subTest(picture=picture,key=key),patch.dict(m.PINS[picture],{key:value}):
                    with self.assertRaisesRegex(ValueError,error): m.decode_sources(pic,big)

    def test_grouped_pictures_have_one_register_and_unknown_scene_count(self):
        batch = self.receipt['groupedBatchExample']
        self.assertEqual(batch['pictureEffects'],[58,58,121]); self.assertEqual(batch['lastPictureRegister'],121)
        self.assertIsNone(batch['sceneCount']); self.assertIn('unresolved',batch['pauseVisibility'])

    def test_only_three_existing_rows_gain_partial_evidence_and_every_other_field_is_preserved(self):
        before = copy.deepcopy(self.registry); enriched = m.enrich_registry(self.registry,self.receipt)
        self.assertEqual(before,self.registry); targets = {m.asset_id(picture) for picture in m.PINS}
        self.assertEqual(len(enriched['assets']),len(before['assets']))
        for prior,current in zip(before['assets'],enriched['assets']):
            if prior['id'] not in targets: self.assertEqual(current,prior); continue
            self.assertEqual({k:v for k,v in current.items() if k != 'gameConsumers'}, {k:v for k,v in prior.items() if k != 'gameConsumers'})
            added = [row for row in current['gameConsumers'] if any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual(len(added),1); self.assertEqual(added[0]['status'],'partial')
            old = [row for row in prior['gameConsumers'] if not any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
            self.assertEqual([row for row in current['gameConsumers'] if row not in added],old)
        self.assertEqual({k:v for k,v in before.items() if k != 'assets'},{k:v for k,v in enriched.items() if k != 'assets'})
        source121 = next(row for row in enriched['assets'] if row['id'] == m.asset_id(121))
        self.assertTrue(any(row['status'] == 'verified' for row in source121['gameConsumers']))
        source58 = next(row for row in enriched['assets'] if row['id'] == m.asset_id(58))
        self.assertTrue(any(any(e.get('reference') == m.throtl.RECEIPT for e in row.get('evidence',[])) for row in source58['gameConsumers']))
        self.assertEqual(m.enrich_registry(enriched,self.receipt),enriched)
        self.assertFalse(m.source.graphics_asset_registry.validate(enriched)[0])

    def test_registry_conflicts_reject_without_mutation(self):
        for picture in m.PINS:
            for mutation in ['missing','duplicate','archive','archivePin','locator','frame1','png','rgb','dimensions','consumer']:
                registry = copy.deepcopy(self.registry); asset = next(a for a in registry['assets'] if a['id'] == m.asset_id(picture))
                if mutation == 'missing': registry['assets'].remove(asset)
                if mutation == 'duplicate': registry['assets'].append(copy.deepcopy(asset))
                if mutation == 'archive': asset['archive']['name'] = 'PIC3.DAX'
                if mutation == 'archivePin': asset['archive']['sha256'] = '0'*64
                if mutation == 'locator': asset['locator']['blockId'] += 1
                if mutation == 'frame1': asset['locator']['frameIndex'] = 1
                if mutation == 'png': asset['decoded']['sha256'] = '0'*64
                if mutation == 'rgb': asset['decoded']['pixelSha256'] = '0'*64
                if mutation == 'dimensions': asset['decoded']['width'] += 1
                if mutation == 'consumer':
                    registry = m.enrich_registry(registry,self.receipt)
                    next(a for a in registry['assets'] if a['id'] == m.asset_id(picture))['gameConsumers'][-1]['status'] = 'verified'
                before = copy.deepcopy(registry)
                with self.subTest(picture=picture,mutation=mutation),self.assertRaises(ValueError): m.enrich_registry(registry,self.receipt)
                self.assertEqual(registry,before)

    def test_determinism_missing_inputs_unchanged114_sources_and_atomic_failure(self):
        paths = [m.ROOT/'Champions of Krynn'/name for name in ['ECL1.DAX','PIC1.DAX','BIGPIC1.DAX']]+[m.source.REGISTRY,m.ROOT/m.source.RECEIPT]
        before = {str(path):m.source.sha(path.read_bytes()) for path in paths}
        self.assertEqual(m.build_receipt(),self.receipt)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); registry_path = root/'registry.json'; registry_path.write_text(json.dumps(self.registry),encoding='utf-8')
            original = registry_path.read_bytes()
            with self.assertRaisesRegex(FileNotFoundError,'ECL1.DAX'): m.build_receipt(root)
            with patch.object(m,'ROOT',root),patch.object(m.source,'REGISTRY',registry_path),patch.object(m,'build_receipt',return_value=self.receipt), \
                    patch.object(sys,'argv',['cok_travel_picture_joins.py','--write']), \
                    patch.object(m.source.graphics_asset_registry,'validate',return_value=(['synthetic rejection'],[])):
                with self.assertRaisesRegex(ValueError,'validation failed'): m.main()
            self.assertEqual(registry_path.read_bytes(),original); self.assertEqual(list(root.iterdir()),[registry_path])
            with patch.object(m.source.os,'replace',side_effect=OSError('synthetic atomic replacement failure')):
                with self.assertRaisesRegex(OSError,'atomic replacement failure'): m.source.atomic_json(registry_path,self.registry,validate_registry=True)
            self.assertEqual(registry_path.read_bytes(),original); self.assertEqual(list(root.iterdir()),[registry_path])
        self.assertEqual({str(path):m.source.sha(path.read_bytes()) for path in paths},before)


if __name__ == '__main__': unittest.main()
