import assert from 'node:assert/strict';
import test from 'node:test';
import { townGraphicsFallbackMessage, townGraphicsMode } from '../src/ui/runtimeGraphicsMode.ts';

test('Town fallback is silent for DOS-EGA, the art set actually rendered there', () => {
  assert.equal(townGraphicsFallbackMessage('DOS-EGA'), null);
});

test('Town explicitly reports its DOS fallback for unadmitted Amiga and Restyle art', () => {
  assert.match(townGraphicsFallbackMessage('Amiga'), /uses DOS-EGA while Amiga is selected/);
  assert.match(townGraphicsFallbackMessage('Restyle'), /uses DOS-EGA while Restyle is selected/);
  assert.match(townGraphicsFallbackMessage('Restyle'), /alternate Town artwork is not admitted/);
});

test('DQK Town never reads or inherits the CoK graphics preference', () => {
  let reads = 0;
  assert.equal(townGraphicsMode('dqk', () => { reads++; return 'Restyle'; }), null);
  assert.equal(reads, 0);
  assert.equal(townGraphicsMode('cok', () => 'Amiga'), 'Amiga');
});
