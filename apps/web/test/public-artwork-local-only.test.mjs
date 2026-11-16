import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { restyleImageSource } from '../src/ui/restyle-image-source.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const gameArtLoaders = [
  '../src/ui/cokAmigaPortrait18Runtime.ts',
  '../src/ui/cokAmigaPortrait57Runtime.ts',
  '../src/ui/cokCombatRestyle.ts',
  '../src/ui/cokDemoArt.ts',
  '../src/ui/cokOpeningArt.ts',
  '../src/ui/cokPlayerAppearance.ts',
  '../src/ui/cokPortraitArt.ts',
  '../src/ui/cokTerrainRestyle.ts',
  '../src/ui/cokTitleArt.ts',
  '../src/ui/cokTravelArt.ts',
  '../src/ui/cokWallRestyle.ts',
];

test('runtime game-derived image loaders use the dev-only fetch adapter', () => {
  for (const path of gameArtLoaders.slice(2)) {
    const source = read(path);
    assert.match(source, /localAssetPackOrDevFetchPinned/ , path);
    assert.doesNotMatch(source, /localAssetPackOrFetchPinned/, path);
  }
  const adapter = read('../src/ui/localAssetPack.ts');
  assert.match(adapter, /readPinnedLocalOrFetch[\s\S]*?import\.meta\.env\.DEV/);
  const core = read('../src/ui/localAssetPackCore.mjs');
  assert.match(core, /if \(!allowDevelopmentFallback\)[\s\S]*?select the local Restyle image folder/);
});

test('Amiga originals never fetch a catalog archive in production without a selected local install', () => {
  for (const path of gameArtLoaders.slice(0, 2).concat('../src/ui/cokAmigaTravelRuntime.ts')) {
    const source = read(path);
    assert.match(source, /if \(!import\.meta\.env\.DEV\)[\s\S]*?Select a local CoK Amiga install/ , path);
    assert.match(source, /fetch\(assetUrl\(bundled\.path\)\)/, `development archive preview retained in ${path}`);
  }
});

test('Restyle viewer shows only a verified local image in production, never the fallback', () => {
  const local = 'blob:verified-local', fallback = './restyle/fallback.png';
  assert.equal(restyleImageSource(local, fallback, false), local);
  assert.equal(restyleImageSource(null, fallback, false), null);
  assert.equal(restyleImageSource(undefined, fallback, false), null);
  assert.equal(restyleImageSource('', fallback, false), null);
  assert.equal(restyleImageSource(null, fallback, true), fallback);
  assert.equal(restyleImageSource(local, fallback, true), local);
});

test('standalone animation gallery never falls back to remote frame images', () => {
  const html = read('../public/restyle/animations.html');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] ?? '';
  assert.match(script, /Vælg den lokale restyle-mappe/);
  assert.match(script, /SHA-256 afviger for/);
  assert.doesNotMatch(script, /image\.src\s*=\s*['"]\.\/['"]\s*\+\s*path/);
});
