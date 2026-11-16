import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import combat from '../src/ui/cokCombatRestyleManifest.json' with { type: 'json' };
import terrain from '../src/ui/cokTerrainRestyleManifest.json' with { type: 'json' };
import walls from '../src/ui/cokWallRestyleManifest.json' with { type: 'json' };
import { bundleCokCombatRestyle } from '../scripts/bundle-cok-combat-restyle.mjs';
import { bundleCokTerrainRestyle } from '../scripts/bundle-cok-terrain-restyle.mjs';
import { bundleCokWallRestyle, dedupeCokWallCandidates } from '../scripts/bundle-cok-wall-restyle.mjs';

const SOURCE = process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done';

test('combat, terrain and wall metadata-only packaging validates pins without writing images', (t) => {
  if (!existsSync(SOURCE)) { t.skip('external reviewed CoK Restyle workspace is unavailable'); return; }
  const root = mkdtempSync(join(process.env.TEMP ?? '.', 'cok-restyle-metadata-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'candidate'); mkdirSync(output);

  const combatCount = combat.banks.flatMap((bank) => bank.icons).length;
  const wallCount = dedupeCokWallCandidates().length;
  assert.equal(bundleCokCombatRestyle(SOURCE, output, undefined, { includeImages: false }), combatCount);
  assert.equal(bundleCokTerrainRestyle(SOURCE, output, { includeImages: false }), terrain.tiles.length);
  assert.equal(bundleCokWallRestyle(SOURCE, output, { includeImages: false }), wallCount);
  assert.deepEqual(readdirSync(output), []);
});
