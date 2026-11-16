"""Synthetic storage controls; only JSON metadata and temporary SQLite are read."""
import copy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from graphics_metadata_pilot import (build_index, check_compatibility, digest, load_parts, reconstruct,
                                    select_slice, split_registry, write_new)


def fixture():
    archive = {'name': 'PIC1.DAX', 'path': 'local/PIC1.DAX', 'sha256': 'a' * 64}
    assets = []
    for entry in (0, 1):
        asset_id = f'cok/dos-ega/disk1/pic1.dax/block/34/entry/{entry}/frame/0'
        assets.append({'id': asset_id, 'game': 'cok', 'platform': 'DOS-EGA', 'edition': 'disk1',
                       'archive': archive, 'locator': {'blockId': 34, 'entryIndex': entry, 'frameIndex': 0},
                       'decoded': {'width': 8, 'height': 8, 'pixelSha256': 'b' * 64,
                                   'path': f'images/{entry}.png', 'sha256': str(entry) * 64},
                       'description': {'text': 'unknown role', 'status': 'unknown',
                                       'visualDescription': 'A red square', 'evidence': [{'reference': 'retained evidence'}]},
                       'gameConsumers': [{'status': 'unknown', 'use': 'not established'}],
                       'animationGroupId': None, 'futureField': {'must': 'survive'}})
    external = {'id': 'cok/amiga/disk2/pic1.daa/block/34/frame/0', 'game': 'cok',
                'platform': 'Amiga', 'archive': {'name': 'PIC1.DAA'}}
    return {'registryVersion': 1, 'assets': assets + [external], 'animationGroups': [],
            'restyles': [{'id': 'restyle/shared', 'sourceAssetIds': [a['id'] for a in assets] + [external['id']],
                          'prompt': {'referenceAssetIds': []}, 'outputs': [{'sha256': 'c' * 64}]}],
            'crossVersionLinks': [{'fromAssetId': assets[0]['id'], 'toAssetId': external['id'],
                                   'relation': 'pixel-identical', 'confidence': 'verified', 'evidence': []}],
            'appearanceSets': []}


class StoragePilotTests(unittest.TestCase):
    def setUp(self):
        self.registry = fixture()
        self.parts = split_registry(self.registry)

    def test_roundtrip_preserves_duplicate_blocks_evidence_and_unknown_fields(self):
        self.assertEqual(reconstruct(self.parts), select_slice(self.registry)[0])
        self.assertEqual(len(self.parts['assets']), 2)
        self.assertEqual(len(self.parts['archives']), 1)
        self.assertEqual(len(self.parts['appearances']), 1)
        self.assertEqual(len(self.parts['manifest']['externalAssetIds']), 1)

    def test_missing_archive_fails(self):
        self.parts['archives'] = []
        with self.assertRaises(KeyError):
            reconstruct(self.parts)

    def test_changed_baseline_is_rejected(self):
        self.registry['assets'][0]['description']['text'] = 'changed baseline'
        with self.assertRaisesRegex(ValueError, 'Baseline registry has changed'):
            check_compatibility(self.parts, self.registry)

    def test_changed_evidence_is_rejected_by_compatibility_check(self):
        self.parts['annotations'][0]['description']['evidence'][0]['reference'] = 'lost evidence'
        with self.assertRaisesRegex(ValueError, 'Compatibility reconstruction differs'):
            check_compatibility(self.parts, self.registry)

    def test_conflicting_archive_fails(self):
        self.parts['archives'][0]['archive']['sha256'] = 'f' * 64
        with self.assertRaisesRegex(ValueError, 'Archive identity'):
            reconstruct(self.parts)

    def test_changed_pixel_identity_fails(self):
        self.parts['appearances'][0]['pixelSha256'] = 'e' * 64
        with self.assertRaisesRegex(ValueError, 'Appearance identity'):
            reconstruct(self.parts)

    def test_missing_annotation_fails(self):
        self.parts['annotations'].pop()
        with self.assertRaisesRegex(ValueError, 'Annotation IDs'):
            reconstruct(self.parts)

    def test_duplicate_asset_id_fails(self):
        self.parts['assets'].append(copy.deepcopy(self.parts['assets'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate identity'):
            reconstruct(self.parts)

    def test_unknown_relationship_endpoint_fails(self):
        self.parts['relationships']['restyles'][0]['sourceAssetIds'].append('missing/source')
        with self.assertRaisesRegex(ValueError, 'Unresolved relationship'):
            reconstruct(self.parts)

    def test_local_external_collision_fails(self):
        self.parts['manifest']['externalAssetIds'].append(self.parts['assets'][0]['record']['id'])
        with self.assertRaisesRegex(ValueError, 'External IDs'):
            reconstruct(self.parts)

    def test_missing_group_fails(self):
        self.parts['assets'][0]['record']['animationGroupId'] = 'missing-group'
        with self.assertRaisesRegex(ValueError, 'Missing frame-group'):
            reconstruct(self.parts)

    def test_null_and_absent_decoded_roundtrip(self):
        self.registry['assets'][0]['decoded'] = None
        del self.registry['assets'][1]['decoded']
        self.assertEqual(reconstruct(split_registry(self.registry)), select_slice(self.registry)[0])

    def test_failed_index_build_publishes_nothing_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch('graphics_metadata_pilot.references', side_effect=ValueError('injected failure')):
                with self.assertRaisesRegex(ValueError, 'injected failure'):
                    build_index(self.parts, root / 'index.sqlite')
            self.assertEqual(list(root.iterdir()), [])

    def test_file_roundtrip_and_index_are_metadata_only_and_exclusive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, value in self.parts.items():
                write_new(root / (name + '.json'), value)
            original_open = Path.open

            def guarded(path, *args, **kwargs):
                if path.suffix.lower() in ('.png', '.dax', '.daa'):
                    raise AssertionError('Opened media')
                return original_open(path, *args, **kwargs)

            with patch.object(Path, 'open', guarded):
                loaded = load_parts(root)
                build_index(loaded, root / 'index.sqlite')
            with closing(sqlite3.connect(root / 'index.sqlite')) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM assets').fetchone()[0], 2)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM appearances').fetchone()[0], 1)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM identities WHERE scope='external'").fetchone()[0], 1)
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                self.assertEqual(db.execute('SELECT value FROM metadata').fetchone()[0], digest(loaded))
                self.assertEqual(db.execute("SELECT COUNT(*) FROM consumers WHERE status='unknown'").fetchone()[0], 2)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM relation_assets').fetchone()[0], 5)
            prior = (root / 'index.sqlite').read_bytes()
            with self.assertRaises(FileExistsError):
                build_index(loaded, root / 'index.sqlite')
            self.assertEqual((root / 'index.sqlite').read_bytes(), prior)
            with self.assertRaises(FileExistsError):
                write_new(root / 'assets.json', [])


if __name__ == '__main__':
    unittest.main()
