import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { bundleCokGeneratedInventory } from '../scripts/bundle-cok-generated-inventory.mjs';
import { encodeTestPng, validatePng } from '../scripts/restyle-png.mjs';
import { sandbox } from './helpers/restyle-stills-fixtures.mjs';
import { filterCokGeneratedAssets, pageCokGeneratedAssets, validateCokGeneratedInventory } from '../src/ui/cok-generated-inventory.mjs';
import { reviewedCardPrompt, reviewedSourcePrompt } from '../src/ui/cok-batch02-prompt-lineage.mjs';
import receipt from '../../../docs/engine/research/cok-restyle-batch02-provenance-v1.json' with { type: 'json' };

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = sandbox(t);
  const source = join(root, 'ledger-root');
  const candidate = join(root, 'candidate');
  const done = join(source, 'done');
  const renders = join(source, 'renders');
  mkdirSync(done, { recursive: true });
  mkdirSync(renders, { recursive: true });
  mkdirSync(candidate);
  const originalBytes = encodeTestPng(8, 8);
  const outputBytes = encodeTestPng(16, 16, [32, 64, 96, 255]);
  const output2Bytes = encodeTestPng(24, 16, [96, 64, 32, 255]);
  const frame1Bytes = encodeTestPng(16, 16, [9, 90, 90, 255]);
  const frame2Bytes = encodeTestPng(16, 16, [90, 9, 90, 255]);
  const frame3Bytes = encodeTestPng(16, 16, [90, 90, 9, 255]);
  const fontSourceBytes = encodeTestPng(8, 16, [96, 32, 64, 255]);
  const fontOutputBytes = encodeTestPng(16, 32, [64, 96, 32, 255]);
  writeFileSync(join(renders, 'source.png'), originalBytes);
  writeFileSync(join(renders, 'exact-source.png'), originalBytes);
  writeFileSync(join(renders, 'PIC1_023_f0.png'), originalBytes);
  writeFileSync(join(renders, 'PIC2_024_f0.png'), originalBytes);
  writeFileSync(join(renders, 'font-source.png'), fontSourceBytes);
  writeFileSync(join(renders, 'dos-alias.png'), encodeTestPng(8, 8, [96, 96, 96, 255]));
  writeFileSync(join(renders, 'secondary-output.png'), frame1Bytes);
  writeFileSync(join(done, 'out.png'), outputBytes);
  writeFileSync(join(done, 'out2.png'), output2Bytes);
  writeFileSync(join(done, 'font-out.png'), fontOutputBytes);
  const batchRoot = join(root, 'batch02');
  mkdirSync(join(batchRoot, 'done'), { recursive: true });
  writeFileSync(join(batchRoot, 'done', 'fixture_out.png'), outputBytes);
  writeFileSync(join(batchRoot, 'fixture_input.png'), originalBytes);
  const promptText = '[TASK]\nfixture prompt joined by exact input/output hashes\n[SAVE AS]\ndone/fixture_out.png\n';
  writeFileSync(join(batchRoot, 'fixture_prompt.txt'), promptText);
  const hubRoot = join(root, 'animation_hubs');
  const pic1Hub = join(hubRoot, 'cok_pic1_023_hub');
  const pic2Hub = join(hubRoot, 'cok_amiga_daa_cok_pic2_pic2_024_f0_hub');
  for (const dir of [pic1Hub, pic2Hub]) mkdirSync(join(dir, 'done'), { recursive: true });
  for (const [dir, last] of [[pic1Hub, null], [pic2Hub, frame3Bytes]]) {
    const order = last ? ['r0', 'r1', 'r0', 'r2', 'r0', 'r3', 'r0'] : ['r0', 'r1', 'r0', 'r2', 'r0'];
    writeFileSync(join(dir, 'PLAYBACK.md'), order.map((frame, i) => `${i + 1}. done/${frame}.png`).join('\n'));
    writeFileSync(join(dir, 'steps.json'), JSON.stringify({ frames: last ? 4 : 3 }));
    writeFileSync(join(dir, 'done', 'r0.png'), outputBytes);
    writeFileSync(join(dir, 'done', 'r1.png'), frame1Bytes);
    writeFileSync(join(dir, 'done', 'r2.png'), frame2Bytes);
    writeFileSync(join(dir, 'hub1_prompt.txt'), '[TASK]\nedit from the exact r0 basis\n[SAVE AS]\ndone/r1.png\n');
    writeFileSync(join(dir, 'hub2_prompt.txt'), '[TASK]\nedit from the exact r0 basis\n[SAVE AS]\ndone/r2.png\n');
    if (last) writeFileSync(join(dir, 'hub3_prompt.txt'), '[TASK]\nedit from the exact r0 basis\n[SAVE AS]\ndone/r3.png\n');
    if (last) writeFileSync(join(dir, 'done', 'r3.png'), last);
  }
  const dos = [
    { platform: 'DOS', family: 'CPIC1', asset_id: 6, frame: 0, source: join(renders, 'source.png'), restyle: join(batchRoot, 'done', 'fixture_out.png'), status: 'restyled' },
    { platform: 'DOS', family: 'CPIC1', asset_id: 7, frame: 0, source: join(renders, 'source.png'), restyle: join(renders, 'secondary-output.png'), status: 'restyled' },
  ];
  const amiga = [
    { file: 'PIC1.DAA', family: 'PIC', block_id: 6, frame: 0, native_size: [8, 8], output: join(renders, 'PIC1_023_f0.png'), restyle_status: 'restyled', restyle_outputs: [join(done, 'out.png'), join(done, 'out2.png')] },
    { file: 'PIC2.DAA', family: 'PIC', block_id: 7, frame: 0, native_size: [8, 8], output: join(renders, 'PIC2_024_f0.png'), restyle_status: 'restyled', restyle_outputs: [join(done, 'out.png')] },
  ];
  const icons = [{ family: 'CPIC1', block_id: 6, source: join(renders, 'source.png'), source_size: [8, 8], restyle: join(done, 'out.png'), restyle_status: 'generated' }];
  const nonPicture = [
    { source: 'C:/fixtures/8X8D0.DAA', source_pixel_alias: join(renders, 'source.png'), output: join(done, 'out.png'), size: [8, 8], family: 'Amiga 8X8D0', block: 1, tile_index: 0, status: 'covered-reviewed-exact-archive-duplicate' },
    { source: join(renders, 'source.png'), output: join(done, 'out.png'), size: [8, 8], family: 'Amiga 8X8D0', block: 2, tile_index: 0, status: 'blank-preserved' },
    { source: join(renders, 'source.png'), output: join(renders, 'exact-source.png'), size: [8, 8], family: 'Amiga 8X8D0', block: 3, tile_index: 0, status: 'covered-reviewed-exact-pixel-duplicate' },
  ];
  writeFileSync(join(source, 'dos_coverage.json'), JSON.stringify({ items: dos }));
  writeFileSync(join(source, 'amiga_coverage.json'), JSON.stringify({ items: amiga }));
  writeFileSync(join(source, 'icon_coverage.json'), JSON.stringify({ assets: icons }));
  writeFileSync(join(source, 'amiga_non_picture_coverage.json'), JSON.stringify({ assets: nonPicture }));
  const acceptedTile = {
    source: join(renders, 'dos-alias.png'), platform: 'DOS CoK', family: '8X8D3', block: 1, tile_index: 7,
    logical_pixel_sha256: 'a'.repeat(64), restyle_source: join(renders, 'source.png'),
    restyle_output: join(done, 'out.png'), status: 'covered-by-reviewed-cross-platform-exact-source',
  };
  const heldTile = { ...acceptedTile, tile_index: 8, restyle_source: undefined, restyle_output: undefined,
    status: 'covered-by-reviewed-generated-restyle' };
  writeFileSync(join(source, 'dos_tile_alias_coverage.json'), JSON.stringify({ entries: [acceptedTile, heldTile] }));
  writeFileSync(join(source, 'dos_dungcom_coverage.json'), JSON.stringify({ assets: [
    { source: join(renders, 'source.png'), output: join(done, 'out.png'), size: [8, 8], family: 'DOS DUNGCOM', block: 1, tile_index: 0, status: 'saved-reviewed' },
  ] }));
  for (const file of [
    'dos_randcom_coverage.json', 'dos_wildcom_coverage.json', 'amiga_8x8d2_014_coverage.json',
    'amiga_8x8d2_171_coverage.json', 'amiga_8x8d2_172_coverage.json', 'amiga_8x8d2_192_coverage.json',
    'amiga_8x8d2_212_coverage.json', 'amiga_comspr_coverage.json', 'CoK_Amiga_8X8D2_011_coverage.json',
    'CoK_Amiga_8X8D2_013_coverage.json', 'CoK_Amiga_8X8D2_191_coverage.json', 'CoK_Amiga_8X8D2_211_coverage.json',
  ]) writeFileSync(join(source, file), JSON.stringify({ assets: [] }));
  writeFileSync(join(source, 'dos_font_coverage.json'), JSON.stringify({
    source_sheet: join(renders, 'font-source.png'), output: join(done, 'font-out.png'), source_block: 201,
    status: 'saved-reviewed', visual_review: { glyphs_exact: 175, glyphs_total: 177, note: 'Two sparse-detail differences.' },
  }));
  writeFileSync(join(source, 'CoK_Amiga_8X8D0_032_retry_coverage.json'), JSON.stringify({ saved_outputs: [
    { index: 9, status: 'saved-reviewed-unmatched' },
  ] }));
  const runtimeManifestPath = join(root, 'runtime.json');
  writeFileSync(runtimeManifestPath, JSON.stringify({ game: 'cok', blockId: 121,
    source: { sha256: hash(originalBytes) }, restyle: { sha256: hash(output2Bytes) } }));
  const runtimeCombatManifestPath = join(root, 'combat-runtime.json');
  writeFileSync(runtimeCombatManifestPath, JSON.stringify({ banks: [{ name: 'CPIC1', sourceArchiveSha256: 'a'.repeat(64), icons: [
    { pictureId: 6, sha256: hash(outputBytes) },
  ] }] }));
  const runtimePlayerManifestPath = join(root, 'player-runtime.json');
  writeFileSync(runtimePlayerManifestPath, JSON.stringify({ appearances: [{ appearanceId: 'fixture-player',
    head: { sourceSha256: hash(originalBytes), restyleSha256: hash(outputBytes) },
    bodyFrames: [{ sourceSha256: hash(originalBytes), restyleSha256: hash(outputBytes) },
      { sourceSha256: hash(originalBytes), restyleSha256: hash(frame1Bytes) }],
  }] }));
  return { source, candidate, runtimeManifestPath, runtimeCombatManifestPath, runtimePlayerManifestPath, originalBytes, outputBytes, output2Bytes, fontSourceBytes, fontOutputBytes, frame1Bytes, frame2Bytes, frame3Bytes, promptText };
}

function packageFixture(f, options = {}) {
  return bundleCokGeneratedInventory(f.source, f.candidate, {
    runtimeManifestPath: f.runtimeManifestPath,
    runtimeCombatManifestPath: f.runtimeCombatManifestPath,
    runtimePlayerManifestPath: f.runtimePlayerManifestPath,
    ...options,
  });
}

test('packager deduplicates exact source/output hashes but preserves aliases and Amiga output variants', (t) => {
  const f = fixture(t);
  const counts = packageFixture(f);
  assert.deepEqual(counts, { ledgerRecords: 13, eligibleRecords: 10, sourceOutputEdges: 10, tileAliasRows: 1, uniquePairs: 4, externalComparisonAliases: 1, aliasEdges: 6, animations: 2, animationPlaybackSteps: 12, excludedRows: 1, heldRows: 2, uniquePngFiles: 7, uniquePngBytes: f.originalBytes.length + f.outputBytes.length + f.fontSourceBytes.length + f.fontOutputBytes.length + f.frame1Bytes.length + f.frame2Bytes.length + f.frame3Bytes.length });
  const root = join(f.candidate, 'restyle', 'cok-generated');
  const manifest = validateCokGeneratedInventory(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
  assert.equal(manifest.assets.length, 4);
  const primaryPair = manifest.assets.find((asset) => asset.outputSha256 === hash(f.outputBytes));
  assert(primaryPair);
  assert.equal(primaryPair.aliases.length, 7);
  assert.equal(primaryPair.animations.length, 2);
  assert.deepEqual(primaryPair.animations[0].playbackOrder, ['r0', 'r1', 'r0', 'r2', 'r0']);
  assert.equal(primaryPair.animations[0].basisOutputSha256, primaryPair.outputSha256);
  assert.deepEqual(primaryPair.animations[1].playbackOrder, ['r0', 'r1', 'r0', 'r2', 'r0', 'r3', 'r0']);
  assert.match(primaryPair.animations[0].frames.r1.promptReference.sha256, /^[a-f0-9]{64}$/);
  assert.equal(primaryPair.outputType, 'Generated/restyled variant with exact reuse aliases');
  assert.equal(primaryPair.promptReferences[0].text, f.promptText);
  assert.equal(primaryPair.promptReferences[0].file, 'fixture_prompt.txt');
  const exactDuplicate = manifest.assets.find((asset) => asset.outputSha256 === asset.sourceSha256);
  assert.equal(exactDuplicate.outputType, 'Exact source-image duplicate');
  assert.equal(manifest.externalComparisons.length, 1);
  assert.equal(manifest.externalComparisons[0].runtimeApproved, true);
  assert.equal(manifest.externalComparisons[0].sourceSha256, hash(f.originalBytes));
  assert.equal(manifest.externalComparisons[0].outputSha256, hash(f.output2Bytes));
  assert(!manifest.assets.some((asset) => asset.outputSha256 === hash(f.output2Bytes)));
  const runtimePair = manifest.assets.find((asset) => asset.outputSha256 === hash(f.outputBytes));
  assert.equal(runtimePair.runtimeApproved, true);
  assert(runtimePair.runtimeApprovalEvidence.some((evidence) => evidence.includes('CPIC1#6')));
  assert(runtimePair.runtimeApprovalEvidence.some((evidence) => evidence.includes('fixture-player')));
  const secondaryPlayerFrame = manifest.assets.find((asset) => asset.outputSha256 === hash(f.frame1Bytes));
  assert(secondaryPlayerFrame);
  assert.equal(secondaryPlayerFrame.runtimeApproved, false);
  assert.equal(secondaryPlayerFrame.runtimeApprovalEvidence.length, 0);
  for (const item of manifest.assets) {
    assert.equal(hash(readFileSync(join(root, item.source))), item.sourceSha256);
    assert.equal(hash(readFileSync(join(root, item.output))), item.outputSha256);
    assert.equal(item.compositionReview, 'not-reviewed');
    assert.equal(item.sourceMatched, true);
  }
  const aliased = manifest.assets.find((asset) => asset.outputSha256 === hash(f.outputBytes));
  assert(aliased.aliases.some((alias) => alias.aliasBasis?.includes('source_pixel_alias')));
  assert(aliased.aliases.some((alias) => alias.ledgerKind === 'dos-tile-alias' && alias.family === '8X8D3'));
  const font = manifest.assets.find((asset) => asset.aliases.some((alias) => alias.ledgerKind === 'dos-font-atlas'));
  assert(font.reviewNotes.some((note) => note.includes('175/177')));
  assert.equal(manifest.excluded[0].status, 'blank-preserved');
  assert.equal(manifest.held.length, 2);
  assert(manifest.held.some((row) => row.ledger === 'CoK_Amiga_8X8D0_032_retry_coverage.json'));
  assert(manifest.held.some((row) => row.ledger === 'dos_tile_alias_coverage.json' && row.index === 1));
});

test('metadata-only mode keeps exact inventory and animation metadata without staging PNGs', (t) => {
  const f = fixture(t);
  const counts = packageFixture(f, { includeImages: false });
  assert.equal(counts.uniquePairs, 4);
  assert.equal(counts.animations, 2);
  assert.equal(counts.uniquePngFiles, 0);
  assert.equal(counts.uniquePngBytes, 0);
  const root = join(f.candidate, 'restyle', 'cok-generated');
  assert.deepEqual(readdirSync(root), ['manifest.json']);
  const manifest = validateCokGeneratedInventory(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
  assert.equal(manifest.imageMode, 'local-pack');
  assert.equal(manifest.assets.length, 4);
  assert.equal(manifest.assets.find((asset) => asset.animations.length).animations.length, 2);
  assert.match(manifest.assets[0].source, /^images\/[a-f0-9]{64}\.png$/);
  assert.deepEqual(readdirSync(f.candidate), ['restyle']);
});

test('filters search family, platform and ledger status; paging never yields over 48 cards', (t) => {
  const f = fixture(t);
  packageFixture(f);
  const manifest = validateCokGeneratedInventory(JSON.parse(readFileSync(join(f.candidate, 'restyle', 'cok-generated', 'manifest.json'), 'utf8')));
  assert.equal(filterCokGeneratedAssets(manifest.assets, { family: 'CPIC1' }).length, 2);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { runtime: 'approved' }).length, 1);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { runtime: 'candidate' }).length, 3);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { platform: 'Amiga' }).length, 2);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { status: 'saved-reviewed' }).length, 2);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { query: 'source_pixel_alias' }).length, 1);
  assert.equal(filterCokGeneratedAssets(manifest.assets, { query: 'fixture prompt joined' }).length, 1);
  assert.deepEqual(filterCokGeneratedAssets(manifest.assets, { query: manifest.assets[0].id }).map((item) => item.id), [manifest.assets[0].id]);
  const source = Array.from({ length: 125 }, (_, i) => i);
  assert.deepEqual(pageCokGeneratedAssets(source, 0).items.length, 48);
  assert.deepEqual(pageCokGeneratedAssets(source, 2).items, source.slice(96, 125));
  assert.throws(() => pageCokGeneratedAssets(source, 0, 49), /limited to 48/);
});

test('validator refuses claims of runtime approval and malformed hashes', (t) => {
  const f = fixture(t);
  packageFixture(f);
  const data = JSON.parse(readFileSync(join(f.candidate, 'restyle', 'cok-generated', 'manifest.json'), 'utf8'));
  const approved = structuredClone(data);
  const unapproved = approved.assets.find((item) => !item.runtimeApproved);
  unapproved.runtimeApproved = true;
  assert.throws(() => validateCokGeneratedInventory(approved), /review metadata/);
  const badHash = structuredClone(data);
  badHash.assets[0].sourceSha256 = 'abc';
  assert.throws(() => validateCokGeneratedInventory(badHash), /review metadata/);
});

test('inventory requires two bounded dimensions and a ledger-status string array before filtering', (t) => {
  const f = fixture(t); packageFixture(f);
  const data = JSON.parse(readFileSync(join(f.candidate, 'restyle', 'cok-generated', 'manifest.json'), 'utf8'));
  const baseline = validateCokGeneratedInventory(data);
  assert.ok(baseline.assets.every((item) => item.sourceSize.length === 2 && item.outputSize.length === 2));

  for (const field of ['sourceSize', 'outputSize']) for (const size of [[], [8], [8, 8, 8]]) {
    const changed = structuredClone(data);
    changed.assets[0][field] = size;
    assert.throws(() => validateCokGeneratedInventory(changed), /review metadata/);
  }

  const arbitraryStatuses = structuredClone(data);
  arbitraryStatuses.assets[0].ledgerStatuses = ['future-status-not-in-ledger', 'arbitrary display value'];
  assert.equal(validateCokGeneratedInventory(arbitraryStatuses), arbitraryStatuses);
  assert.equal(filterCokGeneratedAssets(arbitraryStatuses.assets, { status: 'future-status-not-in-ledger' }).length, 1);
  const invalidStatuses = [
    (item) => { delete item.ledgerStatuses; },
    (item) => { item.ledgerStatuses = null; },
    (item) => { item.ledgerStatuses = 'saved-reviewed'; },
    (item) => { item.ledgerStatuses = { 0: 'saved-reviewed' }; },
    (item) => { item.ledgerStatuses = ['saved-reviewed', 1]; },
    (item) => { item.ledgerStatuses = Array(1); },
  ];
  for (const mutate of invalidStatuses) {
    const changed = structuredClone(data);
    mutate(changed.assets[0]);
    assert.throws(() => validateCokGeneratedInventory(changed), /review metadata/);
  }
});

test('animation validator pins every frame to the source/output pair and complete independent prompt evidence', (t) => {
  const f = fixture(t); packageFixture(f);
  const data = JSON.parse(readFileSync(join(f.candidate, 'restyle', 'cok-generated', 'manifest.json'), 'utf8'));
  const baseline = validateCokGeneratedInventory(data);
  assert.ok(baseline.assets.some((item) => item.animations.length));
  const mutations = [
    (animation) => { animation.basisSourceSha256 = 'a'.repeat(64); },
    (animation) => { animation.frames.r0.size = [0, 16]; },
    (animation) => { animation.frames.r0.sha256 = 'b'.repeat(64); },
    (animation) => { animation.playbackOrder[1] = 'r99'; },
    (animation) => { animation.frames.r1.promptReference.inputSha256 = 'c'.repeat(64); },
    (animation) => { animation.frames.r1.promptReference.text = ''; },
    (animation) => { animation.frames.r1.promptReference.file = ''; },
    (animation) => { animation.frames.r1.note = ' '; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(data);
    const animation = changed.assets.flatMap((item) => item.animations).find((row) => row.id === 'cok-pic1-023');
    mutate(animation);
    assert.throws(() => validateCokGeneratedInventory(changed), /animation|hub frame|prompt|r0/i);
  }
  const duplicate = structuredClone(data);
  const first = duplicate.assets.flatMap((item) => item.animations)[0];
  duplicate.assets.find((item) => item.animations.length).animations.push(structuredClone(first));
  assert.throws(() => validateCokGeneratedInventory(duplicate), /duplicate|animation/i);
});

test('padded prompt receipts retain every source locator and reject substituted inputs, crops, cards and r0 bases', (t) => {
  const f = fixture(t); packageFixture(f);
  const data = JSON.parse(readFileSync(join(f.candidate, 'restyle', 'cok-generated', 'manifest.json'), 'utf8'));
  const batch = receipt.records.filter((row) => row.animationId === null);
  const hubs = receipt.records.filter((row) => row.animationId !== null);
  assert.deepEqual(batch.map((row) => row.file.match(/\/(\d{3})_/)[1]),
    ['001', '002', '003', '005', '007', '009', '015', '026', '029', '036', '041', '042', '043']);
  assert.deepEqual(hubs.map((row) => row.cardId), ['asset-2199-dfca465805b3', 'asset-2529-faafb6026076']);
  assert.equal(batch.flatMap((row) => row.links).length, 14);
  assert.equal(new Set(batch.flatMap((row) => row.links.flatMap((link) => link.sourceAssetIds))).size, 20);
  for (const row of receipt.records) {
    assert.equal(hash(row.text), row.sha256);
    assert.notEqual(row.sourceSha256, row.inputSha256);
    for (const link of row.links) {
      const restyle = { id: link.restyleId, outputs: [{ sha256: row.outputSha256 }],
        sourceAssetIds: link.sourceAssetIds, externalReferences: [{ system: link.system, id: row.cardId }],
        prompt: { sha256: row.sha256, inputSha256: row.inputSha256 } };
      for (const id of link.sourceAssetIds) {
        const source = { id, decoded: { sha256: row.sourceSha256 } };
        assert.equal(reviewedSourcePrompt(source, restyle).sha256, row.sha256);
        assert.equal(reviewedSourcePrompt({ ...source, id: 'other' }, restyle), null);
        assert.equal(reviewedSourcePrompt(source, { ...restyle, outputs: [{ sha256: 'f'.repeat(64) }] }), null);
        assert.equal(reviewedSourcePrompt(source, { ...restyle, prompt: undefined, externalReferences: [{ system: 'other', id: row.cardId }] }), null);
      }
    }
  }

  const primary = data.assets.find((card) => card.animations.length);
  const batchCard = data.assets.find((card) => card !== primary);
  for (const [card, row] of [[batchCard, batch[0]], [primary, hubs[0]]]) {
    const { cardId, sourceSha256, outputSha256 } = row;
    Object.assign(card, { id: cardId, stem: cardId, sourceSha256, outputSha256,
      source: `images/${sourceSha256}.png`, output: `images/${outputSha256}.png`, promptReferences: [] });
  }
  batchCard.promptReferences.push(reviewedCardPrompt(batchCard));
  const animation = primary.animations.find((row) => row.id === hubs[0].animationId);
  primary.animations = [animation];
  animation.basisSourceSha256 = primary.sourceSha256;
  animation.basisOutputSha256 = animation.frames.r0.sha256 = primary.outputSha256;
  for (const [id, frame] of Object.entries(animation.frames)) {
    if (id !== 'r0') frame.promptReference.inputSha256 = primary.outputSha256;
  }
  animation.frames.r0.promptReference = reviewedCardPrompt(primary, animation);
  assert.equal(validateCokGeneratedInventory(data), data);
  const fail = (mutate) => {
    const changed = structuredClone(data);
    mutate(changed.assets.find((card) => card.id === batchCard.id), changed.assets.find((card) => card.id === primary.id));
    assert.throws(() => validateCokGeneratedInventory(changed), /padded-input prompt receipt/);
  };
  fail((card) => { card.promptReferences[0].text += 'edited'; });
  fail((card) => { card.promptReferences[0].inputSha256 = card.sourceSha256; });
  fail((card) => { card.promptReferences[0].inputFile = 'batch02/001_context.png'; });
  fail((card) => { card.promptReferences[0].transform.crop[0]++; });
  fail((card) => { card.promptReferences[0].transform.method = 'bilinear'; });
  fail((card) => { card.id = card.stem = 'asset-9999-aaaaaaaaaaaa'; });
  fail((_, card) => { card.animations[0].id = 'other'; });
  fail((card, hubCard) => { hubCard.animations[0].frames.r0.promptReference = card.promptReferences[0]; });
});

test('full PNG validation accepts real scanline data and rejects CRC corruption', (t) => {
  const root = sandbox(t);
  const valid = join(root, 'valid.png');
  const corrupt = join(root, 'corrupt.png');
  const bytes = encodeTestPng(7, 5);
  writeFileSync(valid, bytes);
  const broken = Buffer.from(bytes);
  broken[broken.length - 5] ^= 0xff;
  writeFileSync(corrupt, broken);
  assert.deepEqual(validatePng(valid), [7, 5]);
  assert.throws(() => validatePng(corrupt), /CRC mismatch/);
});
