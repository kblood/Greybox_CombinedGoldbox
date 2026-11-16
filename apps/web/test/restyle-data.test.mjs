// Pure manifest/selection fixtures; no local generated assets required.
import assert from 'node:assert/strict';
import test from 'node:test';
import { groupRestyleItems, selectRestyleItems, validateRestyleManifest } from '../src/ui/restyle-data.mjs';

const pilotIds = [
  'logo_dok_dragonlance', 'scene_cok_cottage', 'scene_cok_draconian',
  'scene_dok_skeleton_dragon', 'scene_dqk_riders', 'face_cok_amiga_068',
  'face_cok_amiga_069', 'face_cok_dos_068', 'face_cok_dos_069',
  'band_cok_title_art', 'band_dok_ssi_presents', 'band_dqk_world_map',
];
const batch03Ids = [
  'band_cok_dos_ssi_presents', 'cok_dos_title_logo', 'cok_dos_dragonlance_vol1',
  'face_cok_dos_pic1_015_f0', 'scene_cok_dos_pic1_058_f0',
];
const item = (id, stem) => ({ id, stem, kind: 'scene', src: 'provenance/original.png', native_w: 88, native_h: 40, k: 16 });
function combined() {
  return {
    batch: 'batch01+batch02',
    items: [
      ...pilotIds.map((id, i) => item(id, `${String(i + 1).padStart(3, '0')}_${id}`)),
      ...Array.from({ length: 56 }, (_, i) => item(`second_${i}`, `${String(i + 1).padStart(3, '0')}_second_${i}`)),
    ],
  };
}

function combinedWithBatch03() {
  const manifest = combined();
  manifest.batch = 'batch01+batch02+batch03';
  manifest.items.push(...batch03Ids.map((id, i) => item(id, `${String(i + 1).padStart(3, '0')}_${id}`)));
  return manifest;
}

function combinedWithRuntime() {
  const manifest = combinedWithBatch03();
  manifest.items.push(item('cok_overland_bigpic1_121', '074_cok_overland_bigpic1_121'));
  manifest.items.push(item('cok_demo_bigpic2_116', '075_cok_demo_bigpic2_116'));
  return manifest;
}

test('default, null, empty, all and combined batch retain all 68 in manifest order', () => {
  const manifest = combined();
  assert.equal(validateRestyleManifest(manifest), manifest);
  for (const batch of [undefined, null, '', 'all', 'batch01+batch02']) {
    const selected = selectRestyleItems(manifest, batch);
    assert.equal(selected.length, 68);
    assert.deepEqual(selected, manifest.items);
  }
});

test('comparison image hashes are optional as a pair and reject incomplete or malformed metadata', () => {
  const valid = { ...combined(), items: [item('one', 'one')] };
  assert.equal(validateRestyleManifest(valid), valid);
  valid.items[0].sourceSha256 = 'a'.repeat(64);
  valid.items[0].outputSha256 = 'b'.repeat(64);
  assert.equal(validateRestyleManifest(valid), valid);
  for (const mutate of [
    (i) => { i.sourceSha256 = 'a'.repeat(64); },
    (i) => { i.sourceSha256 = 'x'.repeat(64); i.outputSha256 = 'b'.repeat(64); },
  ]) {
    const broken = structuredClone({ ...combined(), items: [item('one', 'one')] });
    mutate(broken.items[0]);
    assert.throws(() => validateRestyleManifest(broken), /sourceSha256 and outputSha256/);
  }
});

test('explicit batches partition 12/56 by exact IDs, not overlapping numeric prefixes or order', () => {
  const manifest = combined();
  manifest.items.reverse();
  const first = selectRestyleItems(manifest, 'batch01');
  const second = selectRestyleItems(manifest, 'batch02');
  assert.equal(first.length, 12);
  assert.equal(second.length, 56);
  assert.deepEqual(first.map((i) => i.id), [...pilotIds].reverse());
  assert.deepEqual(second, manifest.items.filter((i) => i.id.startsWith('second_')));
  assert(first.some((i) => i.stem === '009_face_cok_dos_069'));
  assert(second.some((i) => i.stem === '009_second_8'));
  assert.equal(new Set([...first, ...second].map((i) => i.id)).size, 68);
});

test('batch identity follows the exact ID even when a stem resembles the other batch', () => {
  const manifest = combined();
  manifest.items[0].stem = '099_renamed_pilot';
  manifest.items[12].stem = '001_logo_dok_dragonlance';
  assert(selectRestyleItems(manifest, 'batch01').some((i) => i.stem === '099_renamed_pilot'));
  assert(selectRestyleItems(manifest, 'batch02').some((i) => i.stem === '001_logo_dok_dragonlance'));
});

test('unknown batch and incomplete/misidentified combined membership fail closed', () => {
  assert.throws(() => selectRestyleItems(combined(), '../batch01'), /Unavailable restyle batch/);
  for (const batch of ['batch01', 'batch02']) {
    const missing = combined();
    missing.items.splice(8, 1);
    assert.throws(() => selectRestyleItems(missing, batch), /exact batch membership/);
    const changed = combined();
    changed.items[8].id = 'face_cok_dos_069_extra';
    assert.throws(() => selectRestyleItems(changed, batch), /exact batch membership/);
    assert.throws(() => selectRestyleItems({ ...combined(), batch: 'unknown-union' }, batch), /Unavailable restyle batch/);
  }
});

test('three-batch union partitions 12/56/5 by exact IDs and keeps manifest order', () => {
  const manifest = combinedWithBatch03();
  const all = selectRestyleItems(manifest, 'all');
  const first = selectRestyleItems(manifest, 'batch01');
  const second = selectRestyleItems(manifest, 'batch02');
  const third = selectRestyleItems(manifest, 'batch03');
  assert.equal(all.length, 73);
  assert.equal(first.length, 12);
  assert.equal(second.length, 56);
  assert.equal(third.length, 5);
  assert.deepEqual(third.map((i) => i.id), batch03Ids);
  assert.equal(new Set([...first, ...second, ...third].map((i) => i.id)).size, 73);
  assert.deepEqual(selectRestyleItems(manifest), all);
});

test('three-batch selection fails closed when a known batch01 or batch03 ID is missing', () => {
  for (const missingId of [pilotIds[0], batch03Ids[0]]) {
    const manifest = combinedWithBatch03();
    manifest.items = manifest.items.filter((i) => i.id !== missingId);
    assert.throws(() => selectRestyleItems(manifest, 'batch01'), /exact batch membership/);
    assert.throws(() => selectRestyleItems(manifest, 'batch03'), /exact batch membership/);
  }
  assert.throws(() => selectRestyleItems(combinedWithBatch03(), 'batch04'), /Unavailable restyle batch/);
});

test('runtime comparisons have their own lane and are excluded from the three generated batches', () => {
  const manifest = combinedWithRuntime();
  assert.equal(selectRestyleItems(manifest, 'all').length, 75);
  assert.deepEqual(selectRestyleItems(manifest, 'runtime').map((i) => i.id), ['cok_overland_bigpic1_121', 'cok_demo_bigpic2_116']);
  assert.equal(selectRestyleItems(manifest, 'batch01').length, 12);
  assert.equal(selectRestyleItems(manifest, 'batch02').length, 56);
  assert.equal(selectRestyleItems(manifest, 'batch03').length, 5);
  assert.equal(new Set(['batch01', 'batch02', 'batch03', 'runtime']
    .flatMap((batch) => selectRestyleItems(manifest, batch).map((i) => i.id))).size, 75);
  assert.throws(() => selectRestyleItems(combinedWithBatch03(), 'runtime'), /runtime IDs are missing/);
});

test('game grouping follows explicit metadata and keeps CoK first for focused review', () => {
  const groups = groupRestyleItems([
    { ...item('pool_a', '001_pool_a'), game: 'pool' },
    { ...item('cok_a', '002_cok_a'), game: 'cok' },
    { ...item('dqk_a', '003_dqk_a'), game: 'dqk' },
    item('unclassified_a', '004_unclassified_a'),
    { ...item('dok_a', '005_dok_a'), game: 'dok' },
  ]);
  assert.deepEqual(groups.map(({ game, label, items }) => [game, label, items.length]), [
    ['cok', 'Champions of Krynn', 1],
    ['dok', 'Death Knights of Krynn', 1],
    ['dqk', 'Dark Queen of Krynn', 1],
    ['pool', 'Pools of Darkness', 1],
    ['other', 'Other games', 1],
  ]);
});

test('standalone manifest selects its own batch and rejects the unavailable other batch', () => {
  for (const batch of ['batch01', 'batch02']) {
    const manifest = { batch, items: [item('single', '001_single')] };
    assert.deepEqual(selectRestyleItems(manifest, batch), manifest.items);
    assert.deepEqual(selectRestyleItems(manifest), manifest.items);
    assert.throws(() => selectRestyleItems(manifest, batch === 'batch01' ? 'batch02' : 'batch01'), /Unavailable restyle batch/);
  }
});

for (const [name, mutate] of [
  ['missing batch', (m) => { delete m.batch; }],
  ['empty batch', (m) => { m.batch = ''; }],
  ['missing items', (m) => { delete m.items; }],
  ['empty items', (m) => { m.items = []; }],
  ['null item', (m) => { m.items[0] = null; }],
  ['duplicate ID', (m) => { m.items[1].id = m.items[0].id; }],
  ['duplicate stem', (m) => { m.items[1].stem = m.items[0].stem; }],
  ['path ID', (m) => { m.items[0].id = '../escape'; }],
  ['path stem', (m) => { m.items[0].stem = '../escape'; }],
  ['Windows path stem', (m) => { m.items[0].stem = 'dir\\escape'; }],
  ['encoded separator', (m) => { m.items[0].stem = '%2fescape'; }],
  ['reserved filename', (m) => { m.items[0].stem = 'con'; }],
  ['uppercase stem', (m) => { m.items[0].stem = 'CASE'; }],
  ['invalid source', (m) => { m.items[0].src = null; }],
  ['invalid kind', (m) => { m.items[0].kind = 0; }],
  ['invalid description', (m) => { m.items[0].description = {}; }],
  ['invalid game', (m) => { m.items[0].game = '../escape'; }],
  ['invalid label', (m) => { m.items[0].label = {}; }],
  ['zero width', (m) => { m.items[0].native_w = 0; }],
  ['fractional height', (m) => { m.items[0].native_h = 1.5; }],
  ['invalid scale', (m) => { m.items[0].k = -1; }],
  ['unsafe integer', (m) => { m.items[0].k = Number.MAX_SAFE_INTEGER + 1; }],
]) {
  test(`manifest rejects ${name}`, () => {
    const manifest = combined();
    mutate(manifest);
    assert.throws(() => validateRestyleManifest(manifest), /Invalid restyle manifest/);
  });
}

test('null manifest is rejected; provenance fields are not interpreted as runtime paths', () => {
  assert.throws(() => validateRestyleManifest(null), /Invalid restyle manifest/);
  const manifest = combined();
  Object.assign(manifest.items[0], { src: '../never-read.png', input: '../input.png', expected_output: '../raw.png' });
  assert.equal(validateRestyleManifest(manifest), manifest);
});
