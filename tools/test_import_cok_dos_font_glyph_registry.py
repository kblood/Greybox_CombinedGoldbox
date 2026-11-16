from __future__ import annotations

import copy
import hashlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_ecl_picture_consumers as common  # noqa: E402
import import_cok_dos_font_glyph_registry as glyphs  # noqa: E402


class DosFontGlyphIdentityTests(unittest.TestCase):
    def test_expands_msb_left_rows_into_the_runtime_ega_pixel_indices(self):
        self.assertEqual(glyphs.glyph_pixels(bytes([0b10000001, 0b01000010, 0, 0, 0, 0, 0, 0])[:8]),
                         bytes([15, 0, 0, 0, 0, 0, 0, 15,
                                0, 15, 0, 0, 0, 0, 15, 0] + [0] * 48))

    def test_rejects_glyphs_that_are_not_exactly_eight_rows(self):
        with self.assertRaisesRegex(ValueError, 'exactly eight'):
            glyphs.glyph_pixels(b'1234567')

    def test_builds_distinct_pinned_ids_hashes_and_unknown_text_semantics(self):
        raw = bytes([0b10000001, 0, 0, 0, 0, 0, 0, 0, 0b01000010, 0, 0, 0, 0, 0, 0, 0])
        with patch.object(glyphs, 'GLYPH_COUNT', 2), patch.object(glyphs, 'RUNTIME_SLOTS', 1), patch.object(glyphs, 'RAW_SHA', glyphs.sha(raw)):
            rows = glyphs.build_assets(raw)
        self.assertEqual([row['id'] for row in rows], [glyphs.FONT_ID + '0', glyphs.FONT_ID + '1'])
        self.assertEqual([row['locator']['glyphIndex'] for row in rows], [0, 1])
        self.assertEqual(rows[0]['locator']['kind'], 'glyph')
        self.assertEqual(rows[0]['sourceContentSha256'], hashlib.sha256(raw[:8]).hexdigest())
        self.assertEqual(rows[1]['sourceContentSha256'], hashlib.sha256(raw[8:]).hexdigest())
        self.assertNotEqual(rows[0]['sourcePixelSha256'], rows[1]['sourcePixelSha256'])
        self.assertEqual(rows[0]['description']['status'], 'partial')
        self.assertIn('codepoint', rows[0]['description']['text'])
        self.assertEqual(rows[0]['gameConsumers'][0]['status'], 'partial')
        self.assertEqual(rows[1]['gameConsumers'][0]['status'], 'unknown')
        errors, _warnings = common.graphics_asset_registry.validate({
            'registryVersion': 1, 'assets': rows, 'animationGroups': [], 'restyles': [], 'crossVersionLinks': [],
        })
        self.assertEqual(errors, [])

    def test_rejects_changed_full_font_payload(self):
        with self.assertRaisesRegex(ValueError, 'font bytes differ'):
            glyphs.build_assets(bytes(8 * glyphs.GLYPH_COUNT))

    def test_merges_idempotently_and_rejects_conflicting_existing_locator(self):
        raw = bytes([1, 0, 0, 0, 0, 0, 0, 0])
        with patch.object(glyphs, 'GLYPH_COUNT', 1), patch.object(glyphs, 'RAW_SHA', glyphs.sha(raw)):
            row = glyphs.build_assets(raw)[0]
        registry = {'assets': [copy.deepcopy(row)]}
        self.assertEqual(glyphs.merge_registry(registry, [row]), registry)
        conflicting = copy.deepcopy(registry)
        conflicting['assets'][0]['locator']['glyphIndex'] = 9
        with self.assertRaisesRegex(ValueError, 'conflicts'):
            glyphs.merge_registry(conflicting, [row])


if __name__ == '__main__':
    unittest.main()
