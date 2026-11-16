#!/usr/bin/env python3
"""Add exact stored-glyph identities for CoK DOS 8X8D1.DAX block 201."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json

import cok_ecl_picture_consumers as common
import dax_decode

ROOT = common.ROOT
REGISTRY = common.REGISTRY
ARCHIVE = ROOT / 'Champions of Krynn' / '8X8D1.DAX'
ARCHIVE_SHA = '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915'
RAW_SHA = 'fca3a918bd20e24456f579d20341278a21d3b5f5b4e205384fadeb551ce091c1'
ARCHIVE_PATH = 'Champions of Krynn/8X8D1.DAX'
FONT_ID = 'cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/'
EVIDENCE = 'Champions of Krynn/8X8D1.DAX#201/stored-glyph'
GLYPH_BYTES = 8
GLYPH_COUNT = 177
RUNTIME_SLOTS = 64


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def glyph_pixels(raw: bytes) -> bytes:
    if len(raw) != GLYPH_BYTES:
        raise ValueError('A DOS font glyph must contain exactly eight row bytes')
    return bytes(15 if row & (0x80 >> x) else 0 for row in raw for x in range(8))


def glyph_rgb(raw: bytes) -> bytes:
    pixels = glyph_pixels(raw)
    return bytes(channel for pixel in pixels for channel in dax_decode.EGA_PALETTE[pixel])


def build_assets(raw: bytes) -> list[dict]:
    if len(raw) != GLYPH_BYTES * GLYPH_COUNT or sha(raw) != RAW_SHA:
        raise ValueError('The pinned CoK DOS block 201 font bytes differ')
    archive = {'name': '8X8D1.DAX', 'path': ARCHIVE_PATH, 'sha256': ARCHIVE_SHA}
    assets = []
    for index in range(GLYPH_COUNT):
        stored = raw[index * GLYPH_BYTES:(index + 1) * GLYPH_BYTES]
        pixels = glyph_rgb(stored)
        reference = f'{EVIDENCE}/{index}'
        evidence = [
            {'kind': 'game-data', 'reference': reference,
             'note': 'Exact 8-byte glyph payload at this stored index in the pinned DOS archive and block.'},
            {'kind': 'decoded-pixels', 'reference': reference,
             'note': '8×8 monochrome pixels decoded MSB-left with the DOS EGA palette; text meaning is not inferred.'},
        ]
        addressed = index < RUNTIME_SLOTS
        consumer = {
            'status': 'partial' if addressed else 'unknown',
            'use': (f'The DOS renderer selects stored font slot {index} for character codes that fold to that slot; '
                    'the displayed text meaning remains unmapped.' if addressed else
                    'This stored glyph lies beyond the engine’s 64 folded text slots; any other use is unknown.'),
            'evidence': [{'kind': 'source-code', 'reference': 'packages/engine/src/loaders/cokFont.ts',
                          'note': 'CoK uppercases text and folds character codes modulo 64; only slots 0–63 are addressed.'}],
        }
        assets.append({
            'id': f'{FONT_ID}{index}',
            'game': 'cok',
            'edition': 'DOS install',
            'platform': 'DOS-EGA',
            'archive': copy.deepcopy(archive),
            'locator': {'kind': 'glyph', 'blockId': 201, 'entryIndex': 0, 'frameIndex': None,
                        'tileIndex': None, 'cellIndex': None, 'glyphIndex': index},
            'sourceContentSha256': sha(stored),
            'sourcePixelSha256': sha(pixels),
            'identityStatus': 'source-pinned',
            'description': {
                'text': f'Stored DOS 8×8D1 block 201 font glyph {index}; character/codepoint and exact screen consumer are unknown.',
                'status': 'partial',
                'evidence': evidence,
            },
            'gameConsumers': [consumer],
            'animationGroupId': None,
        })
    return assets


def merge_registry(registry: dict, incoming: list[dict]) -> dict:
    result = copy.deepcopy(registry)
    current = {row.get('id'): row for row in result['assets']}
    if len(current) != len(result['assets']):
        raise ValueError('Existing registry contains duplicate source IDs')
    for row in incoming:
        previous = current.get(row['id'])
        if previous is None:
            result['assets'].append(copy.deepcopy(row))
            continue
        identity_fields = ('game', 'edition', 'platform', 'archive', 'locator',
                           'sourceContentSha256', 'sourcePixelSha256', 'identityStatus')
        if any(previous.get(key) != row.get(key) for key in identity_fields):
            raise ValueError(f'Existing glyph identity conflicts with the pinned source: {row["id"]}')
        if previous.get('description') != row['description']:
            raise ValueError(f'Existing glyph description conflicts with the source-bound description: {row["id"]}')
        previous['gameConsumers'] = copy.deepcopy(row['gameConsumers'])
    return result


def read_raw_archive(path=ARCHIVE) -> bytes:
    data = path.read_bytes()
    if sha(data) != ARCHIVE_SHA:
        raise ValueError('CoK DOS 8X8D1.DAX archive SHA differs')
    base, blocks = dax_decode.parse_container(data)
    if base != 74 or [block.block_id for block in blocks] != [201, 202, 203, 11, 12, 31, 32, 23]:
        raise ValueError('CoK DOS 8X8D1.DAX ordered TOC differs')
    block = blocks[0]
    if (block.index, block.raw_size, block.comp_size, block.data_offset) != (0, 1416, 1341, 0):
        raise ValueError('CoK DOS block 201 framing differs')
    import cok_ecl_picture_census as census
    raw = census.strict_rle(data[base:base + block.comp_size], block.raw_size)
    if sha(raw) != RAW_SHA:
        raise ValueError('CoK DOS block 201 raw SHA differs')
    return raw


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    assets = build_assets(read_raw_archive())
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    updated = merge_registry(registry, assets)
    errors, warnings = common.graphics_asset_registry.validate(updated)
    if errors:
        raise ValueError('Registry validation failed: ' + '; '.join(errors))
    if args.write:
        common.atomic_json(REGISTRY, updated, validate_registry=True)
    print(json.dumps({'glyphs': len(assets), 'sourceArchiveSha256': ARCHIVE_SHA,
                      'blockRawSha256': RAW_SHA, 'registryChanged': updated != registry,
                      'validationErrors': len(errors), 'validationWarnings': len(warnings),
                      'write': args.write}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
