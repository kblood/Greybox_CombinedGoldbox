import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCombatGraphicsMode } from '../src/ui/runtimeGraphicsMode.ts';

test('CoK preserves a requested original mode when the loaded backdrop differs', () => {
  assert.equal(resolveCombatGraphicsMode({ gameId: 'cok', requested: 'Amiga', actual: 'DOS-EGA' }), 'Amiga');
  assert.equal(resolveCombatGraphicsMode({ gameId: 'cok', requested: 'DOS-EGA', actual: 'Amiga' }), 'DOS-EGA');
});

test('Restyle takes precedence over either requested and actual original system', () => {
  for (const requested of ['DOS-EGA', 'Amiga']) for (const actual of ['DOS-EGA', 'Amiga']) {
    assert.equal(resolveCombatGraphicsMode({ gameId: 'cok', restyle: true, requested, actual }), 'Restyle');
  }
});

test('an explicit demo choice takes precedence over Restyle and requested originals', () => {
  for (const demoMode of ['DOS-EGA', 'Amiga', 'Restyle']) {
    assert.equal(resolveCombatGraphicsMode({ gameId: 'cok', demoMode, restyle: true,
      requested: 'Amiga', actual: 'DOS-EGA' }), demoMode);
  }
});

test('an absent request retains the loaded backdrop and finally falls back to DOS', () => {
  assert.equal(resolveCombatGraphicsMode({ gameId: 'cok', actual: 'Amiga' }), 'Amiga');
  assert.equal(resolveCombatGraphicsMode({ gameId: 'cok' }), 'DOS-EGA');
});

test('all CoK natural routes share request precedence without affecting other games', () => {
  for (const gameId of ['cok-natural', ...[2, 3, 4, 5, 6].map((disk) => `cok-natural-${disk}`)]) {
    assert.equal(resolveCombatGraphicsMode({ gameId, requested: 'Amiga', actual: 'DOS-EGA' }), 'Amiga');
  }
  for (const gameId of [undefined, 'dqk', 'dok', 'cok-natural-7', 'cok-unrelated']) {
    assert.equal(resolveCombatGraphicsMode({ gameId, requested: 'Amiga', actual: 'DOS-EGA' }), 'DOS-EGA');
    assert.equal(resolveCombatGraphicsMode({ gameId, requested: 'DOS-EGA', actual: 'Amiga' }), 'Amiga');
    assert.equal(resolveCombatGraphicsMode({ gameId, requested: 'Amiga' }), 'Amiga');
  }
});
