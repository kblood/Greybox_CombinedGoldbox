import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path) => await readFile(new URL(path, import.meta.url), 'utf8');

test('exploration and travel presentation subscribe to local pack changes and reject stale loads', async () => {
  const explore = await source('../src/ui/explore.ts');
  assert.match(explore, /addLocalAssetPackPicker\(/);
  assert.match(explore, /window\.addEventListener\('goldbox:local-asset-pack', syncLocalAssetPack\)/);
  assert.match(explore, /window\.removeEventListener\('goldbox:local-asset-pack', syncLocalAssetPack\)/);
  assert.match(explore, /packRevision !== localAssetPackRevision\(\)/);
  assert.match(explore, /const localPackListener = \(\): void => \{\s*if \(!active\(\)\) return;\s*revision\+\+;\s*art = null;\s*artError = null;\s*loading = false;[\s\S]*?paint\(\);\s*\};/);
  assert.match(explore, /window\.removeEventListener\('goldbox:local-asset-pack', localPackListener\)/);
});

test('dialogue pack changes repaint presentation and clean up without advancing the VM', async () => {
  const dialogue = await source('../src/ui/dialogue.ts');
  const start = dialogue.indexOf('current.localPackListener = (): void => {');
  const end = dialogue.indexOf("window.addEventListener('goldbox:local-asset-pack', current.localPackListener);", start);
  assert.ok(start >= 0 && end > start, 'dialogue pack listener is registered');
  const listener = dialogue.slice(start, end);
  assert.match(listener, /current\.localPackArtGeneration\+\+/);
  assert.match(listener, /current\.loadedRestyles\.clear\(\)/);
  assert.match(listener, /current\.artLoading\.clear\(\)/);
  assert.match(listener, /renderPresentation\(current\.lastTurn\)/);
  assert.doesNotMatch(listener, /\bpresent\s*\(/, 'a pack change must not advance dialogue');
  assert.match(dialogue, /removeEventListener\('goldbox:local-asset-pack', st\.localPackListener\)/);
  assert.match(dialogue, /current\.localPackArtGeneration === artGeneration && localAssetPackRevision\(\) === localPackRevision/);
  assert.match(dialogue, /Amiga source loading; Restyle pending; DOS-EGA original shown/);
  assert.match(dialogue, /Amiga source unavailable \(\$\{amigaError\}\); Restyle unavailable; DOS-EGA original shown/);
  assert.doesNotMatch(dialogue, /Restyle not requested/);
});

test('combat pack refresh uses generation guards, keeps picker keys out of game input, and removes its listener', async () => {
  const combat = await source('../src/ui/combat.ts');
  assert.match(combat, /addLocalAssetPackPicker\(localPackControl, \(\) => \{\}\)/);
  assert.match(combat, /window\.addEventListener\('goldbox:local-asset-pack', onCombatLocalAssetPack\)/);
  assert.match(combat, /window\.removeEventListener\('goldbox:local-asset-pack', onCombatLocalAssetPack\)/);
  assert.match(combat, /e\.target\.closest\('\.gbx-local-pack-picker'\)/);
  assert.match(combat, /current\.restyleArtRevision === revision\s*&& localAssetPackRevision\(\) === packRevision/);
  assert.match(combat, /await prepared\.restyleReady/);
  assert.match(combat, /loadCokCombatRestyleIcons\(assets, cfg\.combatantPictureIds \?\? new Map\(\)\)/);
});

test('CoK demo invalidates owned Restyle bitmaps on local-pack changes and rejects stale decodes', async () => {
  const demo = await source('../src/ui/demoGen1.ts');
  const listenerStart = demo.indexOf('const localPackListener = (): void => {');
  const listenerEnd = demo.indexOf("window.addEventListener('goldbox:local-asset-pack', localPackListener);", listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart, 'demo owns one local-pack listener');
  const listener = demo.slice(listenerStart, listenerEnd);
  assert.match(listener, /if \(state !== target\) return/);
  assert.match(listener, /target\.graphicsRevision\+\+/);
  assert.match(listener, /target\.restyleBitmap\?\.close\(\)/);
  assert.match(listener, /target\.restyleBitmap = null/);
  assert.match(listener, /target\.bitmapPackRevision = null/);
  assert.match(listener, /renderDemoScreen\(\)/);
  assert.doesNotMatch(listener, /runtimeGraphicsMode\s*=|\.vm\.|tick\(/,
    'a graphics-pack change must preserve the selected mode and demo VM');

  const stopped = demo.slice(demo.indexOf('export function stopGen1Demo'), demo.indexOf('function onKey'));
  assert.match(stopped, /removeEventListener\('goldbox:local-asset-pack', state\.localPackListener\)/);
  assert.match(stopped, /state\.restyleBitmap\?\.close\(\)/);
  assert.match(stopped, /state\.restyleBitmap = null/);

  const decode = demo.slice(demo.indexOf('function ensureDemoRestyle'), demo.indexOf('function renderViewport'));
  assert.match(decode, /const revision = target\.graphicsRevision/);
  assert.match(decode, /const packRevision = localAssetPackRevision\(\)/);
  assert.match(decode, /state === target && target\.graphicsRevision === revision\s*&& localAssetPackRevision\(\) === packRevision/);
  assert.match(decode, /if \(!isCurrent\(\)\) \{ bitmap\.close\(\); return; \}/);
  assert.match(decode, /catch\(\(error: unknown\) => \{\s*if \(!isCurrent\(\)\) return;/);
  assert.match(decode, /finally\(\(\) => \{\s*if \(!isCurrent\(\)\) return;/);
});

test('title Restyle refreshes on pack change and disposes both listeners', async () => {
  const title = await source('../src/ui/cokTitleRuntime.ts');
  assert.match(title, /addLocalAssetPackPicker\(controls, \(\) => \{\}\)/);
  assert.match(title, /function onLocalAssetPack\(\): void \{\s*if \(disposed\) return;\s*art\.clear\(\);\s*show\(index\);/);
  assert.match(title, /window\.removeEventListener\('goldbox:local-asset-pack', onLocalAssetPack\)/);
  assert.match(title, /active\(request\)/);
});
