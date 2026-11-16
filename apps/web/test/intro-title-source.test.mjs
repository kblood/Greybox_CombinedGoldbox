import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIntroTitleBytes } from '../src/ui/intro-title-source.mjs';

test('title archive reads by basename from the selected local game install', async () => {
  const expected = new Uint8Array([1, 2, 3]);
  const requests = [];
  const bytes = await loadIntroTitleBytes({
    titlePath: 'The Dark Queen of Krynn/DISK1/TITLE.TLB',
    assetSource: { readAsset: async (name) => { requests.push(name); return expected; } },
    developmentUrl: '/@fs/dev-title.tlb',
    fetchImpl: async () => { throw new Error('local source must take precedence'); },
  });
  assert.deepEqual(requests, ['TITLE.TLB']);
  assert.equal(bytes, expected);
});

test('title archive prefers exact install-relative paths and disambiguates disk archives', async () => {
  const expected = new Uint8Array([4, 5, 6]);
  const requests = [];
  const bytes = await loadIntroTitleBytes({
    titlePath: 'The Dark Queen of Krynn/DISK1/TITLE.TLB',
    assetSource: {
      readPath: async (path) => {
        requests.push(path);
        return path === 'DISK1/TITLE.TLB' ? expected : null;
      },
      readAsset: async () => { throw new Error('basename lookup is ambiguous and must not run'); },
    },
  });
  assert.deepEqual(requests, ['The Dark Queen of Krynn/DISK1/TITLE.TLB', 'DISK1/TITLE.TLB']);
  assert.equal(bytes, expected);
});

test('absolute profile paths use the explicit install-relative archive path before basename lookup', async () => {
  const expected = new Uint8Array([7, 8, 9]);
  const requests = [];
  const bytes = await loadIntroTitleBytes({
    titlePath: 'C:/Program Files/Games/Pool of Radiance/POOLRAD/TITLE.DAX',
    assetRelativePaths: ['Pool of Radiance/POOLRAD/TITLE.DAX', 'POOLRAD/TITLE.DAX'],
    assetSource: {
      readPath: async (path) => { requests.push(path); return path === 'POOLRAD/TITLE.DAX' ? expected : null; },
      readAsset: async () => { throw new Error('exact path must disambiguate this title archive'); },
    },
  });
  assert.deepEqual(requests, ['Pool of Radiance/POOLRAD/TITLE.DAX', 'POOLRAD/TITLE.DAX']);
  assert.equal(bytes, expected);
});

test('an exact-path miss does not fall back to a possibly different same-named archive', async () => {
  let basenameRead = false;
  await assert.rejects(loadIntroTitleBytes({
    titlePath: 'The Dark Queen of Krynn/DISK1/TITLE.TLB',
    assetSource: {
      readPath: async () => null,
      readAsset: async () => { basenameRead = true; return new Uint8Array([1]); },
    },
  }), /not found at an exact path/);
  assert.equal(basenameRead, false);
});

test('missing local title archive fails without HTTP fallback', async () => {
  let fetched = false;
  await assert.rejects(loadIntroTitleBytes({
    titlePath: 'Champions of Krynn/TITLE.DAX',
    assetSource: { readAsset: async () => null },
    developmentUrl: '/@fs/TITLE.DAX',
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  }), /TITLE\.DAX was not found in the selected game folder/);
  assert.equal(fetched, false);
});

test('production with no selected install reports the local-folder action and issues no request', async () => {
  let fetched = false;
  await assert.rejects(loadIntroTitleBytes({
    titlePath: 'Champions of Krynn/TITLE.DAX',
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  }), /Select the matching game folder from Game Library/);
  assert.equal(fetched, false);
});

test('development may fetch the repo title archive and reports HTTP errors', async () => {
  const expected = new Uint8Array([9, 8, 7]);
  let requested;
  const bytes = await loadIntroTitleBytes({
    titlePath: 'Champions of Krynn/TITLE.DAX',
    developmentUrl: '/@fs/Champions%20of%20Krynn/TITLE.DAX',
    fetchImpl: async (url) => {
      requested = url;
      return { ok: true, arrayBuffer: async () => expected.buffer };
    },
  });
  assert.equal(requested, '/@fs/Champions%20of%20Krynn/TITLE.DAX');
  assert.deepEqual([...bytes], [...expected]);
  await assert.rejects(loadIntroTitleBytes({
    titlePath: 'Champions of Krynn/TITLE.DAX', developmentUrl: '/missing',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  }), /Champions of Krynn\/TITLE\.DAX: HTTP 404/);
});
