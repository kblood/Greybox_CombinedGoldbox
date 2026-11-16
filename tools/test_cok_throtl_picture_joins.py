"""Focused source-only Throtl conditional joins; no game/VM/browser execution."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
import cok_throtl_picture_joins as m


class ThrotlPictureJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Missing prerequisites are an explicit failing setup, never a passing empty census.
        cls.receipt = m.build_receipt()
        cls.registry = json.loads(m.source.REGISTRY.read_text(encoding="utf-8"))

    def test_exact_eleven_sites_and_frame0_membership(self):
        receipt = self.receipt
        self.assertEqual([(site["offset"],site["pictureId"]) for site in receipt["sites"]],sorted(m.SITE_ROSTER))
        self.assertEqual(len(receipt["sites"]),11)
        self.assertEqual([row["frameCount"] for row in receipt["sourceFrames"]],[8,1,1])
        self.assertTrue(all(row["frameIndex"] == 0 and row["geometry"] == [88,88,0,0] for row in receipt["sourceFrames"]))
        self.assertEqual(receipt["mapContract"]["order"],["BIGPIC1.DAX","PIC1.DAX"])
        self.assertEqual(len(receipt["issues"]),3)
        self.assertTrue(all(issue["reason"] == "dynamic-picture-operand" for issue in receipt["issues"]))

    def test_receipt_source_pin_roster_operand_and_frame_mutations_rejected(self):
        for mutation in ["eclArchive","eclBlock","bigpic","picBlock","rgb","png","frame1","missingSite","duplicateSite","operand","mapOrder","batchScenes","unknownOrigin"]:
            with self.subTest(mutation=mutation):
                receipt = copy.deepcopy(self.receipt)
                if mutation == "eclArchive": receipt["eclArchiveSha256"] = "0" * 64
                if mutation == "eclBlock": receipt["eclBlockSha256"] = "0" * 64
                if mutation == "bigpic": receipt["bigpicArchiveSha256"] = "0" * 64
                if mutation == "picBlock": receipt["sourceFrames"][0]["blockSha256"] = "0" * 64
                if mutation == "rgb": receipt["sourceFrames"][0]["pixelSha256"] = "0" * 64
                if mutation == "png": receipt["sourceFrames"][0]["pngSha256"] = "0" * 64
                if mutation == "frame1": receipt["sourceFrames"][0]["frameIndex"] = 1
                if mutation == "missingSite": receipt["sites"].pop()
                if mutation == "duplicateSite": receipt["sites"].append(copy.deepcopy(receipt["sites"][0]))
                if mutation == "operand": receipt["sites"][0]["operand"]["code"] = 1
                if mutation == "mapOrder": receipt["mapContract"]["order"].reverse()
                if mutation == "batchScenes": receipt["groupedBatchExample"]["sceneCount"] = 2
                if mutation == "unknownOrigin": receipt["presentationOrigins"]["supplied"]["sourceAssetId"] = m.asset_id(23)
                with self.assertRaises(ValueError): m.verify_receipt(receipt)

    def test_actual_archive_and_decompressed_block_mutations_fail(self):
        pic = (m.ROOT/"Champions of Krynn/PIC1.DAX").read_bytes()
        bigpic = (m.ROOT/"Champions of Krynn/BIGPIC1.DAX").read_bytes()
        for changed_pic,changed_bigpic in [(pic[:-1]+bytes([pic[-1]^1]),bigpic),(pic,bigpic[:-1]+bytes([bigpic[-1]^1]))]:
            with self.assertRaisesRegex(ValueError,"archive SHA"): m.decode_sources(changed_pic,changed_bigpic,m.SOURCE_ROOT)
        with patch.dict(m.PINS[23],blockSha256="0" * 64):
            with self.assertRaisesRegex(ValueError,"block pin"): m.decode_sources(pic,bigpic,m.SOURCE_ROOT)
        with patch.dict(m.PINS[23],pixelSha256="0" * 64):
            with self.assertRaisesRegex(ValueError,"geometry/RGB pin"): m.decode_sources(pic,bigpic,m.SOURCE_ROOT)
        with patch.dict(m.PINS[23],pngSha256="0" * 64):
            with self.assertRaisesRegex(ValueError,"PNG pin"): m.decode_sources(pic,bigpic,m.SOURCE_ROOT)

    def test_loader_order_collision_and_missing_duplicate_toc_controls(self):
        fragment = "[[bigpicBytes,'BIGPIC1.DAX'],[picBytes,'PIC1.DAX']] pictures.set(block.blockId,block.image) frameIndex:0"
        m.verify_map_contract(fragment,m.PIC_TOC,m.BIGPIC_TOC)
        for text,pic_toc,bigpic_toc in [
            (fragment.replace("[[bigpicBytes,'BIGPIC1.DAX'],[picBytes,'PIC1.DAX']]","[[picBytes,'PIC1.DAX'],[bigpicBytes,'BIGPIC1.DAX']]"),m.PIC_TOC,m.BIGPIC_TOC),
            (fragment,m.PIC_TOC+[23],m.BIGPIC_TOC),(fragment,[n for n in m.PIC_TOC if n != 57],m.BIGPIC_TOC),
            (fragment,m.PIC_TOC,m.BIGPIC_TOC+[23]),(fragment.replace('frameIndex:0','frameIndex:1'),m.PIC_TOC,m.BIGPIC_TOC)]:
            with self.assertRaises(ValueError): m.verify_map_contract(text,pic_toc,bigpic_toc)

    def test_current_first_last_application_and_frame0_fragments_are_separately_guarded(self):
        texts = {path:(m.ROOT/path).read_text(encoding="utf-8") for path in {row[1] for row in m.HOST}}
        self.assertEqual(m.verify_host_sources(texts),self.receipt["hostSource"])
        for path,old,new in [
            ('packages/engine/src/ecl/vm.ts',"id: this.rvalue(a[0])","id: 23"),
            ('packages/engine/src/world/dialogue.ts',"effects.length - 1","0"),
            ('packages/engine/src/loaders/dax.ts',"blk.image = anim[0];","blk.image = anim[1];"),
            ('apps/web/src/ui/dialogue.ts',"state.presentation.pictures.get(pictureId)","state.presentation.pictures.get(23)"),
            ('apps/web/src/ui/explore.ts',"[[bigpicBytes, 'BIGPIC1.DAX'], [picBytes, 'PIC1.DAX']]","[[picBytes, 'PIC1.DAX'], [bigpicBytes, 'BIGPIC1.DAX']]")]:
            changed = dict(texts); self.assertIn(old,changed[path]); changed[path] = changed[path].replace(old,new,1)
            with self.subTest(path=path), self.assertRaises(ValueError): m.verify_host_sources(changed)

    def test_dynamic_memory_equal_to_known_ids_never_joins(self):
        operand = {"kind":"dynamic","code":1,"value":0x7F79}
        for memory_value in [23,57,58]:
            binding = m.classify_binding(operand,"local-throtl",{0x7F79:memory_value})
            self.assertEqual(binding["status"],"unresolved-dynamic"); self.assertIsNone(binding["sourceAssetId"])

    def test_grouped_multi_picture_batch_is_not_counted_as_two_scenes(self):
        batch = m.batch_summary([58,57])
        self.assertEqual(batch["lastPictureRegister"],57)
        self.assertIsNone(batch["sceneCount"])
        self.assertIn("unresolved",batch["pauseVisibility"])

    def test_text_only_unknown_and_supplied_origins_do_not_inherit_binding_or_placement(self):
        for origin in ["text-only","unknown","supplied"]:
            self.assertIsNone(m.classify_binding({"code":0,"value":23},origin)["sourceAssetId"])
            self.assertIsNone(m.classify_binding({"code":0,"value":23},origin)["portraitOrigin"])
        for origin in ["local-throtl","borrowed-travel"]:
            bound = m.classify_binding({"code":0,"value":23},origin)
            self.assertEqual(bound["status"],"conditional")
            self.assertIn("no portraitOrigin override",bound["portraitOrigin"]["condition"])

    def test_enrichment_only_appends_three_partial_consumers_and_preserves_all_metadata(self):
        registry = copy.deepcopy(self.registry)
        for asset in registry["assets"]:
            if asset["id"] in {m.asset_id(n) for n in m.PINS}: asset["customMetadata"] = {"keep":[1,2]}
        before = copy.deepcopy(registry); updated = m.enrich_registry(registry,self.receipt)
        self.assertEqual(registry,before)
        self.assertEqual(len(updated["assets"]),len(registry["assets"]))
        for prior,current in zip(registry["assets"],updated["assets"]):
            if prior["id"] in {m.asset_id(n) for n in m.PINS}:
                self.assertEqual({key:value for key,value in current.items() if key != "gameConsumers"},
                                 {key:value for key,value in prior.items() if key != "gameConsumers"})
                appended = [row for row in current["gameConsumers"] if any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
                self.assertEqual(len(appended),1); self.assertEqual(appended[0]["status"],"partial")
                old = [row for row in prior["gameConsumers"] if not any(e.get('reference') == m.RECEIPT for e in row.get('evidence',[]))]
                self.assertEqual([row for row in current["gameConsumers"] if row not in appended],old)
            else: self.assertEqual(current,prior)
        for key in set(registry)-{"assets"}: self.assertEqual(updated[key],registry[key])
        verified57 = next(row for row in self.registry['assets'] if row['id'] == m.asset_id(57))['gameConsumers'][0]
        self.assertEqual(verified57['status'],'verified')
        self.assertEqual(m.enrich_registry(updated,self.receipt),updated)
        self.assertFalse(m.source.graphics_asset_registry.validate(updated)[0])

    def test_missing_duplicate_wrong_bank_frame_and_source_conflicts_rejected(self):
        for mutation in ["missing","duplicate","bank","frame","pixels","sourcePNG","consumer"]:
            registry = copy.deepcopy(self.registry); asset = next(row for row in registry["assets"] if row["id"] == m.asset_id(23))
            if mutation == "missing": registry["assets"].remove(asset)
            if mutation == "duplicate": registry["assets"].append(copy.deepcopy(asset))
            if mutation == "bank": asset["archive"]["name"] = "BIGPIC1.DAX"
            if mutation == "frame": asset["locator"]["frameIndex"] = 1
            if mutation == "pixels": asset["decoded"]["pixelSha256"] = "0"*64
            if mutation == "sourcePNG": asset["decoded"]["sha256"] = "0"*64
            if mutation == "consumer":
                registry = m.enrich_registry(registry,self.receipt)
                asset = next(row for row in registry['assets'] if row['id'] == m.asset_id(23))
                asset['gameConsumers'][-1]['status'] = 'verified'
            before = copy.deepcopy(registry)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.enrich_registry(registry,self.receipt)
            self.assertEqual(registry,before)

    def test_receipt_deterministic_sources_unchanged_and_failed_validation_preserves_bytes(self):
        paths = [m.ROOT/'Champions of Krynn'/name for name in ['ECL1.DAX','PIC1.DAX','BIGPIC1.DAX']] + [m.source.REGISTRY]
        before = {str(path):m.source.sha(path.read_bytes()) for path in paths}
        self.assertEqual(m.build_receipt(),self.receipt)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'registry.json'; path.write_bytes(b'preserve bytes')
            with patch.object(m.source.graphics_asset_registry,'validate',return_value=(["synthetic rejection"],[])):
                with self.assertRaisesRegex(ValueError,'validation failed'): m.source.atomic_json(path,self.registry,validate_registry=True)
            self.assertEqual(path.read_bytes(),b'preserve bytes')
            self.assertEqual(list(Path(directory).iterdir()),[path])
        self.assertEqual({str(path):m.source.sha(path.read_bytes()) for path in paths},before)


if __name__ == '__main__': unittest.main()
