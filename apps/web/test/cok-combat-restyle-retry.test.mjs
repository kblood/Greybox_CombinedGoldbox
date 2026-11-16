import assert from 'node:assert/strict';
import test from 'node:test';
import { createCokCombatRestyleRetry } from '../src/ui/cok-combat-restyle-retry.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const fixture = (overrides = {}) => {
  const calls = [], applied = [], failures = [];
  const request = { archiveSha256: 'bank-a', generation: 'art0:pack0', requestedIds: [1, 1, 2, 3, 4],
    failedIds: new Set([1, 2, 3]), successfulIds: new Set([2]), admitted: id => id < 3,
    load: async id => { calls.push(id); return 'validated-' + id; }, isCurrent: () => true,
    apply: (id, value) => applied.push([id, value]), failed: (id, error) => failures.push([id, error.message]), ...overrides };
  return { request, calls, applied, failures };
};
test('only failed requested admitted ids retry; successes and unrelated fallbacks are untouched', async () => {
  const f = fixture(); await createCokCombatRestyleRetry()(f.request);
  assert.deepEqual(f.calls, [1]); assert.deepEqual(f.applied, [[1, 'validated-1']]); assert.deepEqual(f.failures, []);
  assert.deepEqual([...f.request.successfulIds], [2]); assert.deepEqual([...f.request.failedIds], [1, 2, 3]);
});
test('explicit retry recovers within a live request; validation rejection keeps fallback', async () => {
  const retry = createCokCombatRestyleRetry(); const f = fixture();
  for (const problem of ['hash', 'geometry', 'source-indices', 'silhouette']) {
    await retry({ ...f.request, load: async () => { throw new Error(problem); } });
    assert.equal(f.failures.at(-1)[1], problem); assert.deepEqual(f.applied, []);
  }
  await retry(f.request); assert.deepEqual(f.applied, [[1, 'validated-1']]);
});
test('consecutive explicit choices deduplicate the same archive/id/art/pack flight', async () => {
  const d = deferred(), f = fixture(), retry = createCokCombatRestyleRetry();
  f.request.load = async id => { f.calls.push(id); return d.promise; };
  const first = retry(f.request), duplicate = retry(f.request); await Promise.resolve();
  assert.deepEqual(f.calls, [1]); assert.deepEqual(f.applied, []);
  d.resolve('checked'); await Promise.all([first, duplicate]);
  assert.deepEqual(f.applied, [[1, 'checked']]);
});
test('archive, picture, art and pack generations cannot share an unrelated flight', async () => {
  const d = deferred(), calls = [], retry = createCokCombatRestyleRetry();
  const requests = [{}, { archiveSha256: 'bank-b' }, { generation: 'art1:pack0' }, { generation: 'art0:pack1' },
    { requestedIds: [2], successfulIds: new Set() }].map(change => fixture({ ...change,
      load: async id => { calls.push(id); return d.promise; } }).request);
  const work = requests.map(retry); await Promise.resolve(); assert.equal(calls.length, 5);
  d.resolve('checked'); await Promise.all(work);
});
test('late success and failure after exit, pack/art change or DOS/Amiga choice are ignored', async () => {
  for (const reason of ['exit', 'pack', 'art', 'DOS-EGA', 'Amiga']) for (const rejected of [false, true]) {
    const d = deferred(), f = fixture(), retry = createCokCombatRestyleRetry(); let current = true;
    const done = retry({ ...f.request, load: async () => d.promise, isCurrent: () => current });
    await Promise.resolve(); current = false;
    if (rejected) d.reject(new Error(reason)); else d.resolve('late-' + reason);
    await done; assert.deepEqual(f.applied, []); assert.deepEqual(f.failures, []);
  }
});
test('a fresh explicit Restyle choice can join the same validated flight after a mode change', async () => {
  const d = deferred(), f = fixture(), retry = createCokCombatRestyleRetry(); let epoch = 0;
  const load = async id => { f.calls.push(id); return d.promise; };
  const old = retry({ ...f.request, load, isCurrent: () => epoch === 0 });
  epoch = 2;
  const current = retry({ ...f.request, load, isCurrent: () => epoch === 2 });
  d.resolve('validated'); await Promise.all([old, current]);
  assert.deepEqual(f.calls, [1]); assert.deepEqual(f.applied, [[1, 'validated']]);
});
test('unknown archive and unadmitted selectors never invoke a loader', async () => {
  const f = fixture({ archiveSha256: undefined, admitted: () => false });
  await createCokCombatRestyleRetry()(f.request); assert.deepEqual(f.calls, []); assert.deepEqual(f.applied, []);
});
