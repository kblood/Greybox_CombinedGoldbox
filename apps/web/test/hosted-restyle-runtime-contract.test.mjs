import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessHostedRestyleRuntimeContract, readHostedRestyleRuntimeContracts, verifyHostedRestyleRuntimeContract,
  RUNTIME_CONTRACT_SHA256 } from '../scripts/hosted-restyle-runtime-contract.mjs';
import { cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';
import { buildApp } from '../scripts/build-app.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
const paths = Object.keys(RUNTIME_CONTRACT_SHA256);
function fixture() {
  const manifest = { sourceFrameSize: { width: 24, height: 24 }, sourceMaskKey: 1,
    paletteSelectorIndices: [1,2,3,4,6,7], pixelScale: 4, sourceContainers: { 'CHEAD.DAX': sha('chead'), 'CBODY.DAX': sha('cbody') }, appearances: [] };
  const admission = { schema: 'cok-player-restyle-admission-v1', frames: [] }, sources = new Map(), restyles = new Map(), sets = [];
  const domain = [['05-18-00-02',5,24,[0,2],2], ['05-01-01-02',5,1,[1],2], ['05-17-04-02',5,23,[4,5],2], ['03-0b-03-01',3,11,[3],1]];
  const sourceId = (family, block) => `cok/dos-ega/install/${family.toLowerCase()}.dax/block/${block}/frame/0`;
  for (const [suffix,head,body,slots,code] of domain) {
    const offset = code === 2 ? 64 : 0, headBlocks = [head+offset,head+offset+128], bodyBlocks = [body+offset,body+offset+128];
    const part = (family,block,height) => ({ sourceFile: `dos/${family}/${family}_${block}.png`, sourceSha256: sha(`${family}/${block}`),
      restyleFile: `done/${family}_${block}_restyle.png`, restyleSha256: sha(`restyle/${family}/${block}`), nativeWidth: 24, nativeHeight: height });
    const appearance = { appearanceId: `cok-player-${suffix}`, head: { ...part('CHEAD',headBlocks[0],8), blockIds: headBlocks },
      bodyFrames: bodyBlocks.map(block => ({ ...part('CBODY',block,24), blockId: block })),
      sourceTuples: slots.map(slot => ({ cHeadRequest: head, cBodyBlock: body, cBodySlot: slot, suffixCode: code })) };
    manifest.appearances.push(appearance);
    const variants = bodyBlocks.map((block,index) => {
      const components = [['head','CHEAD',headBlocks[index],appearance.head],['body','CBODY',block,appearance.bodyFrames[index]]].map(([role,family,sourceBlock,p]) => {
        const id = sourceId(family,sourceBlock), restyleId = `restyle/${family.toLowerCase()}-${role === 'head' ? headBlocks[0] : sourceBlock}`;
        sources.set(id, { id, game: 'cok', platform: 'DOS-EGA', edition: 'DOS', archive: { name: `${family}.DAX`, path: `Champions of Krynn/${family}.DAX`, sha256: manifest.sourceContainers[`${family}.DAX`] },
          locator: { kind: 'block-frame', blockId: sourceBlock, frameIndex: 0, tileIndex: null, cellIndex: null },
          decoded: { width: p.nativeWidth*4, height: p.nativeHeight*4, sha256: p.sourceSha256 } });
        if (!restyles.has(restyleId)) restyles.set(restyleId, { id: restyleId, sourceAssetIds: [], outputs: [{ sha256: p.restyleSha256 }], reviewStatus: 'generated' });
        const ids = restyles.get(restyleId).sourceAssetIds; if (!ids.includes(id)) ids.push(id);
        return { role, assetId: id, restyleIds: [restyleId] };
      });
      const pins = p => ({ sourceSha256: p.sourceSha256, restyleSha256: p.restyleSha256 });
      admission.frames.push({ appearanceId: appearance.appearanceId, frameIndex: index, headBlockIds: headBlocks, bodyBlockId: block,
        head: pins(appearance.head), body: pins(appearance.bodyFrames[index]), state: index ? 'held' : 'admitted',
        reason: index ? 'awaiting-prompt-and-composition-review' : 'existing-primary-runtime-mapping' });
      return { index, components };
    });
    sets.push({ id: `cok/dos-ega/appearance/${suffix}`, manifestId: appearance.appearanceId, game: 'cok', platform: 'DOS-EGA',
      sourceManifest: { path: paths[0], sha256: '' }, variants,
      acceptedTuples: appearance.sourceTuples.map((tuple,index) => ({ ...tuple, role: index ? 'storage-slot-alias' : 'primary', ...(index ? { aliasOf: 0 } : {}) })) });
  }
  const bindings = { schema: 'cok-player-canonical-bindings-v1', inputSha256: {}, settings: Object.fromEntries(Object.entries(manifest).filter(([k]) => k !== 'appearances')),
    appearanceSets: sets, sources: [...sources.values()], restyles: [...restyles.values()], admission: admission.frames };
  const combat = { banks: [{ name: 'CPIC1', disk: 1, sourceArchiveSha256: sha('CPIC1'), icons: [{ bank: 'CPIC1', pictureId: 8, stem: 'CPIC1_008_restyle', sha256: sha('combat') }] }] };
  const f = { manifest, admission, bindings, combat, contracts: {}, hashes: {} };
  f.refresh = () => { f.contracts[paths[0]] = bytes(manifest); f.contracts[paths[1]] = bytes(admission);
    bindings.inputSha256 = { manifest: sha(f.contracts[paths[0]]), policy: sha(f.contracts[paths[1]]), registry: sha('synthetic registry provenance') };
    sets.forEach(set => { set.sourceManifest.sha256 = bindings.inputSha256.manifest; }); f.contracts[paths[2]] = bytes(bindings);
    for (const path of paths.slice(3,6)) f.contracts[path] = Buffer.from('synthetic provenance only; never imported: '+path);
    f.contracts[paths[6]] = bytes(combat); f.hashes = Object.fromEntries(paths.map(p => [p,sha(f.contracts[p])])); };
  f.inventory = (change = () => {}) => {
    const rows = manifest.appearances.flatMap(a => [a.head,...a.bodyFrames].flatMap((p,index) => ['original',...(index !== 2 ? ['restyle'] : [])].map(kind => ({
      path: `restyle/cok/player/${a.appearanceId}/${kind}/${(kind === 'original' ? p.sourceFile : p.restyleFile).split('/').at(-1)}`,
      byteLength: 1, sha256: kind === 'original' ? p.sourceSha256 : p.restyleSha256 }))));
    rows.push({ path: 'restyle/cok/combat/CPIC1_008_restyle.png', byteLength: 1, sha256: combat.banks[0].icons[0].sha256 }); change(rows);
    rows.sort((a,b) => a.path < b.path ? -1 : 1); const descriptor = { schema: 'greybox-hosted-restyle-pack-v1', fileCount: rows.length, totalBytes: rows.reduce((n,r) => n+r.byteLength,0), files: rows };
    return { descriptor, pin: sha(bytes(descriptor)) };
  };
  f.assess = inventory => assessHostedRestyleRuntimeContract(inventory.descriptor, inventory.pin, f.contracts, f.hashes);
  f.verify = (descriptor,pin) => verifyHostedRestyleRuntimeContract(descriptor,pin,f.contracts,f.hashes);
  f.refresh(); return f;
}

test('synthetic valid contract is deterministic, exactly derives destinations and preserves held fallback', () => {
  const f = fixture(), inventory = f.inventory(), result = f.verify(inventory.descriptor,inventory.pin);
  assert.deepEqual(result, f.assess(inventory)); assert.equal(result.required.length, 21); assert.equal(result.compatible, true);
  assert.equal(result.variants.filter(v => v.restyleAvailable).length, 4); assert.equal(result.variants.filter(v => v.state === 'held').length, 4);
  assert.ok(result.variants.every(v => v.originalFallbackAvailable)); assert.equal(result.playback, 'held');
  assert.equal(result.descriptorInventorySha256, inventory.pin); assert.deepEqual(result.contractSha256,f.hashes);
});

test('missing/wrong required path rejects while valid originals remain available without optional restyle', () => {
  for (const mode of ['missing','hash']) { const f = fixture(), inventory = f.inventory(rows => {
    const index = rows.findIndex(r => r.path.includes('/restyle/')); if (mode === 'missing') rows.splice(index,1); else rows[index].sha256 = '0'.repeat(64); });
    const result = f.assess(inventory); assert.equal(result.compatible,false); assert.equal(result.unavailable[0].reason,mode === 'missing' ? 'missing' : 'hash-mismatch');
    assert.ok(result.variants.every(v => v.originalFallbackAvailable)); assert.equal(result.variants[0].restyleAvailable,false);
    assert.throws(() => f.verify(inventory.descriptor,inventory.pin), /incompatible/);
  }
});

test('stale bytes/admission/canonical selector and accidentally admitted held variants reject', () => {
  for (const fault of ['bytes','admission','selector','held','canonical-pin']) { const f = fixture(), inventory = f.inventory();
    if (fault === 'bytes') f.contracts[paths[0]] = Buffer.concat([f.contracts[paths[0]],Buffer.from('\n')]);
    else { if (fault === 'admission') f.admission.frames[0].body.sourceSha256 = '0'.repeat(64);
      if (fault === 'selector') f.bindings.appearanceSets[0].acceptedTuples[0].cBodySlot = 99;
      if (fault === 'held') f.admission.frames[1].state = 'admitted'; f.refresh(); }
    if (fault === 'canonical-pin') { f.bindings.inputSha256.manifest = '0'.repeat(64); f.contracts[paths[2]] = bytes(f.bindings); f.hashes[paths[2]] = sha(f.contracts[paths[2]]); }
    assert.throws(() => f.assess(inventory), /contract changed|canonical binding|stale|admission/i);
  }
});

test('combat exact bank/picture/stem path and hash cannot be replaced by another descriptor row', () => {
  for (const mode of ['path','hash']) { const f = fixture(), inventory = f.inventory(rows => { const row = rows.find(r => r.path.includes('/combat/'));
    if (mode === 'path') row.path = row.path.replace('008','009'); else row.sha256 = '0'.repeat(64); });
    const result = f.assess(inventory); assert.equal(result.compatible,false); assert.equal(result.unavailable[0].path,'restyle/cok/combat/CPIC1_008_restyle.png');
    assert.equal(result.unavailable[0].pictureId,8); assert.equal(result.unavailable[0].bank,'CPIC1'); assert.ok(result.variants.every(v => v.originalFallbackAvailable));
  }
});

test('duplicate/conflicting player destinations and combat selectors reject; held pack membership grants nothing', () => {
  const duplicate = fixture(), duplicateInventory = duplicate.inventory(); duplicate.manifest.appearances[0].bodyFrames[0].sourceFile = duplicate.manifest.appearances[0].head.sourceFile; duplicate.refresh();
  assert.throws(() => duplicate.assess(duplicateInventory), /roster|duplicate/i);
  const combat = fixture(); combat.combat.banks[0].icons.push({ ...combat.combat.banks[0].icons[0], sha256: '0'.repeat(64) }); combat.refresh();
  assert.throws(() => combat.assess(combat.inventory()), /duplicate/i);
  const held = fixture(), a = held.manifest.appearances[0], body = a.bodyFrames[1], inventory = held.inventory(rows => rows.push({
    path: `restyle/cok/player/${a.appearanceId}/restyle/${body.restyleFile.split('/').at(-1)}`, byteLength: 1, sha256: body.restyleSha256 }));
  const result = held.assess(inventory); assert.equal(result.compatible,true); assert.equal(result.variants[1].candidatePresent,true);
  assert.equal(result.variants[1].restyleAvailable,false); assert.ok(!result.required.some(r => r.path.endsWith(body.restyleFile.split('/').at(-1))));
});

test('build invokes the real synthetic verifier before pack access/commands; mismatches fail and production override rejects', t => {
  const root = mkdtempSync(join(tmpdir(),'hosted-runtime-synthetic-')); t.after(() => rmSync(root,{ recursive:true,force:true }));
  for (const valid of [true,false]) { const f = fixture(), inventory = f.inventory(rows => { if (!valid) rows.pop(); });
    const descriptor = join(root,`descriptor-${valid}.json`); writeFileSync(descriptor,bytes({ descriptor:inventory.descriptor,inventorySha256:inventory.pin }));
    let commands = 0, verified = false;
    const env = { GB_HOSTED_RESTYLE_ROOT: join(root,'never-read-pack'), GB_HOSTED_RESTYLE_DESCRIPTOR: descriptor,
      GB_HOSTED_RESTYLE_INVENTORY_SHA256: inventory.pin, GB_SOURCE_INVENTORY_SHA256: '2'.repeat(64), GB_CANDIDATE_RECEIPT:join(root,`receipt-${valid}.json`), GB_APP_OUTPUT:join(root,`output-${valid}`) };
    assert.throws(() => buildApp({ env, runCommand: () => { commands++; }, runtimeContractVerifier: (d,p) => {
      f.verify(d,p); verified = true; throw new Error('synthetic stop before pack access'); } }), valid ? /synthetic stop/ : /incompatible/);
    assert.equal(verified,valid); assert.equal(commands,0);
  }
  assert.throws(() => buildApp({ runtimeContractVerifier: () => ({ compatible:true }) }), /override requires an injected command runner/);
});

test('default pins admit only seven fixed contracts and derive the complete held runtime roster', () => {
  const contracts = readHostedRestyleRuntimeContracts();
  assert.equal(Object.keys(contracts).length, 7);
  const manifest = JSON.parse(contracts[paths[0]].toString('utf8'));
  const admission = JSON.parse(contracts[paths[1]].toString('utf8'));
  const combat = JSON.parse(contracts[paths[6]].toString('utf8'));
  const files = cokPlayerAppearancePackagePlan(manifest, admission).map(entry => ({
    path: `restyle/cok/player/${entry.dest}`, byteLength: 1, sha256: entry.sha256.toLowerCase(),
  }));
  for (const bank of combat.banks) for (const icon of bank.icons) files.push({
    path: `restyle/cok/combat/${icon.stem}.png`, byteLength: 1, sha256: icon.sha256.toLowerCase(),
  });
  files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const descriptor = { schema: 'greybox-hosted-restyle-pack-v1', fileCount: files.length,
    totalBytes: files.reduce((total, row) => total + row.byteLength, 0), files };
  const pin = sha(bytes(descriptor));
  const result = verifyHostedRestyleRuntimeContract(descriptor, pin, contracts);
  assert.equal(result.compatible, true);
  assert.equal(result.required.length, 128);
  assert.equal(result.variants.filter(variant => variant.state === 'held').length, 4);
  assert.equal(result.playback, 'held');
  assert.equal(result.runtimeObservations, 0);

  for (const path of paths) {
    const changed = { ...contracts, [path]: Buffer.concat([contracts[path], Buffer.from('\n')]) };
    assert.throws(() => verifyHostedRestyleRuntimeContract(descriptor, pin, changed),
      error => error instanceof Error && error.message === `Runtime contract changed: ${path}`);
  }
});
