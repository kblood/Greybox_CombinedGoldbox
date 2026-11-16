import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetPathReader, indexPreferredAssetPaths, normalizeAssetPath, NULL_ASSET_SOURCE } from '../src/ui/assetSource.ts';

test('relative path normalization preserves the folder namespace and normalizes slash/case', () => {
  assert.equal(normalizeAssetPath('Disk2\\PIC1.DAA'), 'disk2/pic1.daa');
  assert.equal(normalizeAssetPath('Restyle/Combat/CPIC2_010.png'), 'restyle/combat/cpic2_010.png');
  assert.equal(normalizeAssetPath('PIC1.DAA'), 'pic1.daa');
  assert.equal(normalizeAssetPath('my folder/.metadata/portrait.png'), 'my folder/.metadata/portrait.png');
});

test('absolute, traversal, drive-relative, URL and ambiguous separator paths are rejected', () => {
  for (const path of ['', '/disk1/pic.daa', '\\disk1\\pic.daa', '//server/share/pic.daa',
    'C:\\game\\PIC.DAA', 'C:PIC.DAA', 'file:///game/pic.daa', 'https://host/pic.daa',
    '../pic.daa', 'disk1/../pic.daa', 'disk1\\..\\pic.daa', './pic.daa', 'disk1/./pic.daa',
    'disk1//pic.daa', 'disk1/pic.daa/', 'disk1/.. /pic.daa', 'disk1./pic.daa',
    'disk1/pic.daa ', 'pic.daa:stream', 'pic\0.daa', 'disk1/\npic.daa']) {
    assert.equal(normalizeAssetPath(path), null, JSON.stringify(path));
  }
});

test('same basenames on two discs and at the root resolve independently without fallback', async () => {
  const files = new Map([
    ['Disk1/PIC1.DAA', Uint8Array.of(1)], ['Disk2/PIC1.DAA', Uint8Array.of(2)],
    ['PIC1.DAA', Uint8Array.of(3)],
  ]);
  const calls = [];
  const read = createAssetPathReader([...files.keys()], async (path) => { calls.push(path); return files.get(path); });
  assert.deepEqual(await read('DISK2\\pic1.daa'), Uint8Array.of(2));
  assert.deepEqual(await read('disk1/PIC1.DAA'), Uint8Array.of(1));
  assert.deepEqual(await read('pic1.daa'), Uint8Array.of(3));
  assert.equal(await read('disk3/pic1.daa'), null);
  assert.deepEqual(calls, ['Disk2/PIC1.DAA', 'Disk1/PIC1.DAA', 'PIC1.DAA']);
  const noRoot = createAssetPathReader(['Disk1/PIC1.DAA'], async () => Uint8Array.of(1));
  assert.equal(await noRoot('PIC1.DAA'), null);
});

test('case/slash duplicates and repeated entries remain ambiguous regardless of scan order', async () => {
  for (const paths of [
    ['Disk1/PIC1.DAA', 'disk1/pic1.daa'], ['disk1/pic1.daa', 'Disk1/PIC1.DAA'],
    ['Disk1/PIC1.DAA', 'Disk1\\PIC1.DAA'], ['Disk1/PIC1.DAA', 'Disk1/PIC1.DAA'],
    ['Disk1/PIC1.DAA', 'disk1/pic1.daa', 'DISK1/PIC1.DAA'],
  ]) {
    let calls = 0;
    const read = createAssetPathReader([...paths, 'Disk2/PIC1.DAA'], async () => { calls++; return Uint8Array.of(2); });
    assert.equal(await read('disk1/pic1.daa'), null);
    assert.equal(calls, 0);
    assert.deepEqual(await read('disk2/pic1.daa'), Uint8Array.of(2));
    assert.equal(calls, 1);
  }
});

test('invalid indexed/requested paths never reach a backend or fetch a basename', async () => {
  let calls = 0;
  const read = createAssetPathReader(['../PIC.DAA', 'C:/PIC.DAA', '/PIC.DAA', 'safe/PIC.DAA'], async () => {
    calls++;
    return Uint8Array.of(1);
  });
  for (const path of ['../PIC.DAA', 'C:/PIC.DAA', '/PIC.DAA', 'safe/../PIC.DAA', 'PIC.DAA', 'missing/PIC.DAA']) {
    assert.equal(await read(path), null);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await read('safe/PIC.DAA'), Uint8Array.of(1));
});

test('browser-style normalized map and Electron-style original-path callback use the same exact key', async () => {
  const paths = ['Disk1\\PIC1.DAA', 'Disk2/PIC1.DAA'];
  const byPath = new Map([['disk1/pic1.daa', async () => Uint8Array.of(1)], ['disk2/pic1.daa', async () => Uint8Array.of(2)]]);
  const browser = createAssetPathReader(paths, (path) => byPath.get(normalizeAssetPath(path))());
  const calls = [];
  const electron = createAssetPathReader(paths, async (path) => {
    calls.push(path);
    return Uint8Array.of(paths.indexOf(path) + 1);
  });
  for (const request of ['DISK1/PIC1.DAA', 'disk2\\pic1.daa']) {
    assert.deepEqual(await browser(request), await electron(request));
  }
  assert.deepEqual(calls, paths, 'Backend receives the scanned spelling, never a caller-supplied OS path');
});

test('legacy basename preference and null-source reads remain unchanged', async () => {
  const paths = ['cloud_saves/SAVE/CHRDATA1.GAM', 'SAVE/CHRDATA1.GAM', 'DISK2/ECL1.DAX', 'DISK1/ECL1.DAX'];
  const index = indexPreferredAssetPaths(paths);
  assert.equal(index.get('chrdata1.gam'), 'SAVE/CHRDATA1.GAM');
  assert.equal(index.get('ecl1.dax'), 'DISK2/ECL1.DAX');
  assert.equal(await NULL_ASSET_SOURCE.readAsset('PIC1.DAA'), null);
  assert.equal(await NULL_ASSET_SOURCE.readPath('disk1/PIC1.DAA'), null);
});

test('missing files stay null and backend read failures remain failures', async () => {
  const read = createAssetPathReader(['missing.dat', 'denied.dat'], async (path) => {
    if (path === 'denied.dat') throw new Error('permission denied');
    return null;
  });
  assert.equal(await read('missing.dat'), null);
  await assert.rejects(read('denied.dat'), /permission denied/);
});
