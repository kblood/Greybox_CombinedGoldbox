import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCokPlayInstall } from '../src/ui/cok-play-source.mjs';

const entry = (profileId = 'champions-of-krynn', platform = 'DOS', label = 'install') => ({
  kind: 'game', match: { profileId, platform }, assetSource: { label },
});

test('an explicitly selected CoK DOS install wins over other matching installs', () => {
  const first = entry('champions-of-krynn', 'DOS', 'first');
  const selected = entry('champions-of-krynn', 'DOS', 'selected');
  assert.deepEqual(resolveCokPlayInstall([first, selected], selected), {
    status: 'selected', entry: selected, count: 1,
  });
});

test('one CoK DOS install can be selected automatically', () => {
  const only = entry();
  assert.deepEqual(resolveCokPlayInstall([entry('death-knights-of-krynn'), only]), {
    status: 'unique', entry: only, count: 1,
  });
});

test('an unrelated selected game never supplies the CoK source', () => {
  const unrelated = entry('death-knights-of-krynn', 'DOS');
  assert.deepEqual(resolveCokPlayInstall([unrelated], unrelated), {
    status: 'missing', entry: null, count: 0,
  });
});

test('multiple CoK DOS installs require an explicit choice', () => {
  assert.deepEqual(resolveCokPlayInstall([entry(), entry('champions-of-krynn', 'DOS', 'second')]), {
    status: 'ambiguous', entry: null, count: 2,
  });
});

test('modules and non-DOS CoK installs are not candidates', () => {
  assert.deepEqual(resolveCokPlayInstall([
    { kind: 'module' }, entry('champions-of-krynn', 'Amiga'), entry('pool-of-radiance', 'DOS'),
  ]), { status: 'missing', entry: null, count: 0 });
});
