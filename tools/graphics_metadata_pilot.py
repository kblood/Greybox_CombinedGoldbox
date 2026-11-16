"""Lossless, metadata-only PIC1 storage pilot; never opens game archives or images."""
from __future__ import annotations

import argparse
import copy
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import os

PARTS = ('archives', 'appearances', 'assets', 'annotations', 'relationships')
RELATIONS = ('animationGroups', 'restyles', 'crossVersionLinks', 'appearanceSets')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def read_json(path):
    # This tool accepts JSON metadata only, never follows archive/image references.
    if path.suffix.lower() != '.json':
        raise ValueError('Metadata input must be JSON')
    return json.loads(path.read_text(encoding='utf-8'))


def references(value, known):
    if isinstance(value, dict):
        return set().union(*(references(v, known) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(references(v, known) for v in value)) if value else set()
    return {value} if isinstance(value, str) and value in known else set()


def select_slice(registry):
    if registry['registryVersion'] != 1:
        raise ValueError('Unsupported registry version')
    all_ids = [a['id'] for a in registry['assets']]
    if len(all_ids) != len(set(all_ids)):
        raise ValueError('Duplicate source IDs in input registry')
    assets = [a for a in registry['assets'] if a['game'] == 'cok'
              and a['platform'] == 'DOS-EGA' and a['archive']['name'].upper() == 'PIC1.DAX']
    if not assets:
        raise ValueError('No CoK DOS-EGA PIC1 assets')
    selected = {a['id'] for a in assets}
    result = {'registryVersion': registry['registryVersion'], 'assets': copy.deepcopy(assets)}
    known = set(all_ids)
    for key in RELATIONS:
        result[key] = copy.deepcopy([row for row in registry.get(key, [])
                                    if references(row, known) & selected])
    return result, known


def split_registry(registry):
    selected, known = select_slice(registry)
    result = {part: [] for part in PARTS}
    archives, appearances = {}, {}
    for original in selected['assets']:
        record = copy.deepcopy(original)
        archive = record.pop('archive')
        archive_record = {'sourceSet': {k: record[k] for k in ('game', 'platform', 'edition')},
                          'archive': archive}
        archive_id = 'archive/' + digest(archive_record)
        archives[archive_id] = {'id': archive_id, **archive_record}
        annotation = {'id': record['id'], 'description': record.pop('description'),
                      'gameConsumers': record.pop('gameConsumers')}
        decoded = record.pop('decoded', None)
        appearance_id = None
        if decoded is not None:
            appearance = {k: decoded.pop(k) for k in ('width', 'height', 'pixelSha256') if k in decoded}
            if appearance.get('pixelSha256'):
                appearance_id = 'appearance/' + digest(appearance)
                appearances[appearance_id] = {'id': appearance_id, **appearance}
            else:
                decoded.update(appearance)
        result['assets'].append({'record': record, 'archiveId': archive_id,
                                 'appearanceId': appearance_id, 'decoded': decoded,
                                 'decodedPresent': 'decoded' in original})
        result['annotations'].append(annotation)
    result['archives'] = sorted(archives.values(), key=lambda x: x['id'])
    result['appearances'] = sorted(appearances.values(), key=lambda x: x['id'])
    result['relationships'] = {key: selected[key] for key in RELATIONS}
    local_ids = {a['id'] for a in selected['assets']}
    external = references(result['relationships'], known) - local_ids
    result['manifest'] = {
        'format': 'goldbox-graphics-shard-pilot-v1',
        'registryVersion': selected['registryVersion'],
        'selection': {'game': 'cok', 'platform': 'DOS-EGA', 'archive': 'PIC1.DAX'},
        'baselineRegistryCanonicalSha256': digest(registry),
        'baselineSliceCanonicalSha256': digest(selected),
        'externalAssetIds': sorted(external),
    }
    return result


def unique(rows, key):
    result = {}
    for row in rows:
        identity = key(row)
        if identity in result:
            raise ValueError(f'Duplicate identity: {identity}')
        result[identity] = row
    return result


def reconstruct(parts):
    manifest = parts['manifest']
    if manifest['format'] != 'goldbox-graphics-shard-pilot-v1':
        raise ValueError('Unsupported shard format')
    archives = unique(parts['archives'], lambda x: x['id'])
    appearances = unique(parts['appearances'], lambda x: x['id'])
    annotations = unique(parts['annotations'], lambda x: x['id'])
    assets = unique(parts['assets'], lambda x: x['record']['id'])
    if assets.keys() != annotations.keys():
        raise ValueError('Annotation IDs must match local asset IDs exactly')
    external = manifest['externalAssetIds']
    if len(set(external)) != len(external) or set(external) & assets.keys():
        raise ValueError('External IDs must be unique and distinct from local IDs')
    output = {'registryVersion': manifest['registryVersion'], 'assets': []}
    for asset_id, row in assets.items():
        record = copy.deepcopy(row['record'])
        for field in ('archive', 'description', 'gameConsumers', 'decoded'):
            if field in record:
                raise ValueError(f'Normalized record contains reserved field {field}')
        archive = archives[row['archiveId']]
        if archive['sourceSet'] != {k: record[k] for k in ('game', 'platform', 'edition')}:
            raise ValueError('Archive source-set mismatch')
        if archive['id'] != 'archive/' + digest({k: v for k, v in archive.items() if k != 'id'}):
            raise ValueError('Archive identity mismatch')
        record['archive'] = copy.deepcopy(archive['archive'])
        record.update({k: copy.deepcopy(annotations[asset_id][k]) for k in ('description', 'gameConsumers')})
        if row['decodedPresent']:
            decoded = copy.deepcopy(row['decoded'])
            if row['appearanceId'] is not None:
                appearance = appearances[row['appearanceId']]
                fields = {k: v for k, v in appearance.items() if k != 'id'}
                if appearance['id'] != 'appearance/' + digest(fields):
                    raise ValueError('Appearance identity mismatch')
                if decoded is None or set(fields) & decoded.keys():
                    raise ValueError('Conflicting decoded appearance fields')
                decoded.update(fields)
            record['decoded'] = decoded
        elif row['decoded'] is not None or row['appearanceId'] is not None:
            raise ValueError('Absent decoded object cannot carry rendering data')
        output['assets'].append(record)
    for key in RELATIONS:
        output[key] = copy.deepcopy(parts['relationships'][key])
    # Validate semantic relation endpoints, including references outside this shard.
    known = assets.keys() | set(external)
    required = set()
    for row in output['restyles']:
        required.update(row['sourceAssetIds'])
        required.update(row.get('prompt', {}).get('referenceAssetIds', []))
    for row in output['animationGroups']:
        required.update(frame['assetId'] for frame in row['frames'])
    for row in output['crossVersionLinks']:
        required.update((row['fromAssetId'], row['toAssetId']))
    for row in output['appearanceSets']:
        for variant in row['variants']:
            required.update(item['assetId'] for item in variant['components'])
    if required - known:
        raise ValueError(f'Unresolved relationship endpoints: {sorted(required - known)}')
    groups = unique(output['animationGroups'], lambda x: x['id'])
    unique(output['restyles'], lambda x: x['id'])
    for record in output['assets']:
        group_id = record.get('animationGroupId')
        if group_id is not None and (group_id not in groups or record['id'] not in
                [frame['assetId'] for frame in groups[group_id]['frames']]):
            raise ValueError('Missing frame-group membership')
    return output


def load_parts(directory):
    return {name: read_json(directory / (name + '.json')) for name in ('manifest', *PARTS)}


def check_compatibility(parts, registry):
    result = reconstruct(parts)
    if digest(registry) != parts['manifest']['baselineRegistryCanonicalSha256']:
        raise ValueError('Baseline registry has changed; reconcile before regenerating')
    if result != select_slice(registry)[0] or digest(result) != parts['manifest']['baselineSliceCanonicalSha256']:
        raise ValueError('Compatibility reconstruction differs from baseline')
    return result


def write_new(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def build_index(parts, output):
    registry = reconstruct(parts)
    if output.exists():
        raise FileExistsError(output)
    # Build beside the destination, publishing only a fully committed database.
    descriptor, temporary = tempfile.mkstemp(prefix='graphics-index-', suffix='.sqlite', dir=output.parent)
    os.close(descriptor)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.execute('PRAGMA foreign_keys=ON')
            db.executescript('''
                CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE identities(id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('local','external')));
                CREATE TABLE archives(id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE appearances(id TEXT PRIMARY KEY, width INTEGER, height INTEGER, pixel_sha256 TEXT);
                CREATE TABLE assets(id TEXT PRIMARY KEY REFERENCES identities(id), archive_id TEXT NOT NULL REFERENCES archives(id), appearance_id TEXT REFERENCES appearances(id), data TEXT NOT NULL);
                CREATE TABLE annotations(asset_id TEXT PRIMARY KEY REFERENCES assets(id), visual_description TEXT, semantic_status TEXT, data TEXT NOT NULL);
                CREATE TABLE consumers(asset_id TEXT NOT NULL REFERENCES assets(id), ordinal INTEGER NOT NULL, status TEXT, data TEXT NOT NULL, PRIMARY KEY(asset_id,ordinal));
                CREATE TABLE relations(kind TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,ordinal));
                CREATE TABLE relation_assets(kind TEXT NOT NULL, ordinal INTEGER NOT NULL, asset_id TEXT NOT NULL REFERENCES identities(id), FOREIGN KEY(kind,ordinal) REFERENCES relations(kind,ordinal), PRIMARY KEY(kind,ordinal,asset_id));
                CREATE INDEX appearances_by_pixels ON appearances(pixel_sha256);
                CREATE INDEX consumer_status ON consumers(status);
                CREATE INDEX relation_asset_id ON relation_assets(asset_id);
            ''')
            db.execute('INSERT INTO metadata VALUES (?,?)', ('sourceCanonicalSha256', digest(parts)))
            ids = {a['id'] for a in registry['assets']}
            external = set(parts['manifest']['externalAssetIds'])
            db.executemany('INSERT INTO identities VALUES (?,?)', [(i, 'local') for i in sorted(ids)] + [(i, 'external') for i in sorted(external)])
            for row in parts['archives']:
                db.execute('INSERT INTO archives VALUES (?,?)', (row['id'], canonical(row)))
            for row in parts['appearances']:
                db.execute('INSERT INTO appearances VALUES (?,?,?,?)', (row['id'], row.get('width'), row.get('height'), row['pixelSha256']))
            for row in parts['assets']:
                db.execute('INSERT INTO assets VALUES (?,?,?,?)', (row['record']['id'], row['archiveId'], row['appearanceId'], canonical(row)))
            for row in parts['annotations']:
                db.execute('INSERT INTO annotations VALUES (?,?,?,?)', (row['id'], row['description'].get('visualDescription'), row['description']['status'], canonical(row)))
                for ordinal, consumer in enumerate(row['gameConsumers']):
                    db.execute('INSERT INTO consumers VALUES (?,?,?,?)', (row['id'], ordinal, consumer.get('status'), canonical(consumer)))
            for kind in RELATIONS:
                for ordinal, row in enumerate(registry[kind]):
                    db.execute('INSERT INTO relations VALUES (?,?,?)', (kind, ordinal, canonical(row)))
                    for asset_id in sorted(references(row, ids | external)):
                        db.execute('INSERT INTO relation_assets VALUES (?,?,?)', (kind, ordinal, asset_id))
            if db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Index has broken references')
        # Hard link publishes exclusively; it cannot overwrite an existing output.
        os.link(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    extract = commands.add_parser('extract')
    extract.add_argument('--registry', type=Path, required=True)
    extract.add_argument('--out', type=Path, required=True)
    for name in ('check', 'export', 'index'):
        command = commands.add_parser(name)
        command.add_argument('--source', type=Path, required=True)
        if name == 'check':
            command.add_argument('--registry', type=Path, required=True)
        else:
            command.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'extract':
        registry = read_json(args.registry)
        parts = split_registry(registry)
        if reconstruct(parts) != select_slice(registry)[0]:
            raise ValueError('Extraction is not lossless')
        args.out.mkdir(parents=True, exist_ok=False)
        for name, value in parts.items():
            write_new(args.out / (name + '.json'), value)
        print('Extracted lossless PIC1 metadata shard')
        return
    parts = load_parts(args.source)
    result = reconstruct(parts)
    if args.command == 'check':
        registry = read_json(args.registry)
        result = check_compatibility(parts, registry)
        print(json.dumps({'lossless': True, 'assets': len(result['assets']), 'appearances': len(parts['appearances']),
                          'externalAssetIds': len(parts['manifest']['externalAssetIds']),
                          **{key: len(result[key]) for key in RELATIONS}}, sort_keys=True))
    elif args.command == 'export':
        write_new(args.out, result)
        print('Exported scoped registry-v1 compatibility JSON')
    else:
        build_index(parts, args.out)
        print('Built disposable SQLite research index')


if __name__ == '__main__':
    main()
