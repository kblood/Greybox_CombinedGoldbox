import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleCokDialogueRestyle } from '../scripts/bundle-cok-dialogue-restyle.mjs';
import { bundleCokTravelRestyle } from '../scripts/bundle-cok-travel-restyle.mjs';
import travel from '../src/ui/cokTravelRestyleManifest.json' with { type: 'json' };
import dialogue from '../src/ui/cokDialogueRestyleManifest.json' with { type: 'json' };
import dialogue58 from '../src/ui/cokDialogue58RestyleManifest.json' with { type: 'json' };
import dialogue15 from '../src/ui/cokDialogue15RestyleManifest.json' with { type: 'json' };
import { validateRestyleManifest, validateRestyleFidelity } from '../src/ui/restyle-data.mjs';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const goldboxImgRoot = resolve(process.env.GB_GOLDBOX_IMG_ROOT ?? 'C:/GoldBoxImg');
const imageRoot = resolve(process.env.GB_COK_RESTYLE_SOURCE_ROOT ?? 'C:/GoldBoxImg/cok_restyle_work');
const travelOutput = resolve(process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done');
const temporary = (t, prefix) => {
  const path = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
};

test('dialogue metadata-only validates all three portraits without writing image files', (t) => {
  if (!existsSync(join(imageRoot, 'done', 'PIC1_057_f0_restyle.png'))
      || !existsSync(join(goldboxImgRoot, 'batch03_work', 'pic1_058_restyle_candidate_v2_import.png'))
      || !existsSync(join(goldboxImgRoot, 'batch03/native/004_face_cok_dos_pic1_015_f0.png'))
      || !existsSync(join(goldboxImgRoot, 'batch03_work/dist-app-cok-pic1-58-dialogue-candidate-20261026/restyle/out/004_face_cok_dos_pic1_015_f0.png'))
      || !existsSync(join(repo, 'renders/dax_complex/CoK_PIC1/PIC1_058_f0.png'))) {
    t.skip('Pinned dialogue source inputs are unavailable'); return;
  }
  const output = temporary(t, 'greybox-dialogue-metadata-');
  const dialogueOut = join(output, 'restyle/cok/dialogue');
  mkdirSync(dialogueOut, { recursive: true });
  for (const item of [dialogue, dialogue58, dialogue15]) {
    const path = join(dialogueOut, item.restyle.file);
    copyFileSync(join(imageRoot, 'done', 'PIC1_057_f0_restyle.png'), path);
  }
  assert.equal(bundleCokDialogueRestyle(undefined, output, undefined, undefined, undefined, undefined,
    { includeImages: false }), null);
  for (const item of [dialogue, dialogue58, dialogue15]) assert.equal(existsSync(join(dialogueOut, item.restyle.file)), false);
});

test('travel metadata-only validates the map and updates comparison metadata without PNG writes', (t) => {
  const sourceImage = join(imageRoot, travel.source.file);
  const restyleImage = join(travelOutput, travel.restyle.file);
  const galleryRoot = join(repo, 'renders/restyle-site/restyle');
  if (![sourceImage, restyleImage, join(galleryRoot, 'manifest.json'), join(galleryRoot, 'fidelity.json')].every(existsSync)) {
    t.skip('Pinned travel/gallery source inputs are unavailable'); return;
  }
  const temp = temporary(t, 'greybox-travel-metadata-');
  const sourceRoot = join(temp, 'source');
  const source = join(sourceRoot, 'done');
  const output = join(temp, 'output');
  mkdirSync(source, { recursive: true }); mkdirSync(output);
  for (const file of [travel.source.file]) {
    const destination = join(sourceRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(imageRoot, file), destination);
  }
  copyFileSync(restyleImage, join(source, travel.restyle.file));
  const restyle = join(output, 'restyle');
  mkdirSync(restyle);
  for (const file of ['manifest.json', 'fidelity.json']) copyFileSync(join(galleryRoot, file), join(restyle, file));
  const galleryStem = '074_cok_overland_bigpic1_121';
  const ownedPaths = [
    join(restyle, 'cok/travel', travel.restyle.file),
    join(restyle, 'orig', `${galleryStem}.png`),
    join(restyle, 'out', `${galleryStem}.png`),
  ];
  for (const path of ownedPaths) {
    mkdirSync(dirname(path), { recursive: true });
    copyFileSync(sourceImage, path);
  }

  assert.equal(bundleCokTravelRestyle(source, output, { includeImages: false }), null);
  const manifest = validateRestyleManifest(JSON.parse(readFileSync(join(restyle, 'manifest.json'), 'utf8')));
  const fidelity = validateRestyleFidelity(JSON.parse(readFileSync(join(restyle, 'fidelity.json'), 'utf8')), manifest);
  assert.ok(manifest.items.some((item) => item.id === 'cok_overland_bigpic1_121'));
  assert.ok(fidelity.results.some((row) => row.id === 'cok_overland_bigpic1_121' && row.verdict === 'ok'));
  assert.ok(ownedPaths.every((path) => !existsSync(path)), 'Metadata-only mode clears its runtime and comparison PNGs');
});
