import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareHostedRestylePack } from '../scripts/hosted-restyle-pack.mjs';
import { HOSTED_METADATA_PATHS, validateHostedRestyleMetadata } from '../scripts/hosted-restyle-metadata.mjs';
import { buildApp } from '../scripts/build-app.mjs';
import { bundleAssets } from '../scripts/bundle-assets.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (path,bytes) => { mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,bytes); };
const json = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(),'hosted-metadata-synthetic-')); t.after(() => rmSync(root,{recursive:true,force:true}));
  const files = new Map(), image = (path,value) => { files.set(path,Buffer.from(value)); return sha(value); };
  const manifest = { batch:'synthetic',items:['cok','dok'].map((game,i) => ({id:`card-${i}`,stem:`card-${i}`,kind:'scene',src:'../inert-provenance',description:'Preserved description',game,native_w:1,native_h:1,k:1})) };
  for(const item of manifest.items) { image(`restyle/orig/${item.stem}.png`,'original'); image(`restyle/out/${item.stem}.png`,'restyle'); }
  const fidelity = {missing:[],results:manifest.items.map(item=>({id:item.id,stem:item.stem,size:[1,1],verdict:'ok',edge_corr:1,hist_dist:0,aspect_dev:0}))};
  const animation = {items:[{id:'hub',frames:2,staged:[0,1],texts:[{frame:0,what:'unchanged',source:'manual'}]}],problems:[],imageSha256:{}};
  for(const i of [0,1])for(const p of ['o','r'])animation.imageSha256[`hub/${p}${i}.png`]=image(`restyle/anim/hub/${p}${i}.png`,p+i);
  const source=sha('generated source'),output=sha('generated output'),alternate=sha('generated alternate');
  for(const value of ['generated source','generated output','generated alternate'])image(`restyle/cok-generated/images/${sha(value)}.png`,value);
  const generated = {schema:'cok-restyle-inventory-v1',imageMode:'bundled',excluded:[],held:[{reason:'held metadata retained'}],externalComparisons:[],
    counts:{uniquePairs:1,sourceOutputEdges:1,tileAliasRows:0,externalComparisonAliases:0,aliasEdges:0,ledgerRecords:2,eligibleRecords:1,excludedRows:0,heldRows:1,uniquePngFiles:3,uniquePngBytes:51},
    assets:[{id:'asset-0001-abcdef123456',stem:'asset-0001-abcdef123456',sourceSha256:source,outputSha256:output,source:`images/${source}.png`,output:`images/${output}.png`,sourceSize:[1,1],outputSize:[1,1],
      platform:'DOS',platforms:['DOS'],family:'PIC',families:['PIC'],aliases:[{ledger:'synthetic',status:'restyled',family:'PIC',platform:'DOS'}],outputType:'Generated/restyled variant',promptReferences:[],
      sourceMatched:true,compositionReview:'not-reviewed',runtimeApproved:false,runtimeApprovalEvidence:[],prompt:'',ledgerStatuses:['restyled'],animations:[{id:'preview-hub',label:'synthetic',basisSourceSha256:source,basisOutputSha256:output,
        playbackOrder:['r0','r1','r0'],frames:{r0:{sha256:output,size:[1,1],note:'hub',promptReference:null},r1:{sha256:alternate,size:[1,1],note:'changed',promptReference:{file:'change.txt',sha256:sha('prompt'),inputSha256:output,outputSha256:alternate,text:'change'}}},playbackEvidence:'metadata only',derivation:'fixture'}]}]};
  const f={root,files,manifest,fidelity,animation,generated,source:join(root,'source'),output:join(root,'output'),receipt:join(root,'receipt.json'),commands:[]};
  f.refresh=()=>{[manifest,fidelity,animation,generated].forEach((data,i)=>files.set(HOSTED_METADATA_PATHS[i],json(data)));};
  f.inventory=()=>{const rows=[...files].map(([path,bytes])=>({path,byteLength:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.path<b.path?-1:1);
    f.descriptor={schema:'greybox-hosted-restyle-pack-v1',fileCount:rows.length,totalBytes:rows.reduce((n,r)=>n+r.byteLength,0),files:rows};
    f.pin=sha(JSON.stringify(f.descriptor));return f;};
  f.buffers=()=>Object.fromEntries(HOSTED_METADATA_PATHS.map(path=>[path,files.has(path)?Buffer.from(files.get(path)):null]));
  f.prepare=()=>{f.inventory();for(const[path,bytes]of files)put(join(f.source,path.slice('restyle/'.length)),bytes);put(join(root,'descriptor.json'),json({descriptor:f.descriptor,inventorySha256:f.pin}));};
  f.animationPath=join(root,'viewer.html');put(f.animationPath,'<script>const HOSTED_RESTYLE = null; /* hosted-restyle-config */</script>');
  f.corePath=join(root,'core.mjs');put(f.corePath,'export const synthetic = true;');
  f.env=()=>({GB_HOSTED_RESTYLE_ROOT:f.source,GB_HOSTED_RESTYLE_DESCRIPTOR:join(root,'descriptor.json'),GB_HOSTED_RESTYLE_INVENTORY_SHA256:f.pin,
    GB_SOURCE_INVENTORY_SHA256:'2'.repeat(64),GB_CANDIDATE_RECEIPT:f.receipt,GB_APP_OUTPUT:f.output});
  f.run=(args,label)=>{f.commands.push(label);if(f.hosted!==false)assert.ok(['vite build','copy-public-app-assets','bundle-assets'].includes(label),'Restyle packager forbidden in hosted mode');
    if(label==='vite build')for(const[path,bytes]of Object.entries({'index.html':'<html/>','assets/app.js':'void 0;','assets/app.css':'body{}'}))put(join(f.output,path),bytes);
    if(label==='copy-public-app-assets'){put(join(f.output,'dragon.svg'),'<svg/>');put(join(f.output,'restyle/animations.html'),readFileSync(f.animationPath));}
    if(label==='bundle-assets'){assert.ok(args.includes('--metadata-only'));put(join(f.output,'games/cok.json'),'{"files":[]}');}
    f.afterCommand?.(label);};
  f.options=()=>({env:f.env(),runCommand:f.run,runtimeContractVerifier:()=>({compatible:true}),gitHead:'1'.repeat(40),animationPath:f.animationPath,corePath:f.corePath});
  f.refresh();f.inventory();return f;
}

test('exact four buffers validate existing schemas and every descriptor image join without decoding',t=>{
  const f=fixture(t),result=validateHostedRestyleMetadata(f.descriptor,f.pin,f.buffers());
  assert.equal(result.metadata.length,4);assert.equal(result.validation.comparisons,2);assert.equal(result.validation.generatedPairs,1);
  assert.equal(result.validation.heldRecords,1);assert.equal(result.validation.animations,1);assert.equal(result.validation.uniqueReferencedPaths,11);
  assert.ok(f.manifest.items.every(item=>item.sourceSha256===undefined),'optional hashes remain absent');
});

test('missing/extra/malformed/wrong hash or length buffers and bad reference joins reject before commands',t=>{
  for(const fault of ['missing','extra','malformed','hash','length','missing-image','frame-hash','generated-hash','unsafe','order']){
    const f=fixture(t);
    if(fault==='missing')f.files.delete(HOSTED_METADATA_PATHS[1]);
    if(fault==='extra')f.files.set('restyle/extra.json',Buffer.from('{}'));
    if(fault==='malformed')f.files.set(HOSTED_METADATA_PATHS[0],Buffer.from('{'));
    if(fault==='missing-image')f.files.delete('restyle/orig/card-0.png');
    if(fault==='frame-hash'){f.animation.imageSha256['hub/r0.png']='0'.repeat(64);f.refresh();}
    if(fault==='generated-hash'){f.generated.assets[0].source=`images/${'0'.repeat(64)}.png`;f.generated.assets[0].sourceSha256='0'.repeat(64);f.generated.assets[0].animations[0].basisSourceSha256='0'.repeat(64);f.refresh();}
    if(fault==='unsafe'){f.animation.imageSha256['../unsafe.png']=sha('unsafe');f.refresh();}
    if(fault==='order'){f.animation.items[0].staged=[0,0];f.refresh();}
    f.prepare();if(fault==='hash'||fault==='length'){const row=f.descriptor.files.find(r=>r.path===HOSTED_METADATA_PATHS[0]);if(fault==='hash')row.sha256='0'.repeat(64);else row.byteLength++;
      f.pin=sha(JSON.stringify(f.descriptor));put(join(f.root,'descriptor.json'),json({descriptor:f.descriptor,inventorySha256:f.pin}));}
    assert.throws(()=>validateHostedRestyleMetadata(f.descriptor,f.pin,f.buffers()));assert.throws(()=>buildApp(f.options()));assert.deepEqual(f.commands,[]);assert.equal(existsSync(f.receipt),false);
  }
  const f=fixture(t),buffers=f.buffers();buffers['restyle/extra.json']=Buffer.from('{}');assert.throws(()=>validateHostedRestyleMetadata(f.descriptor,f.pin,buffers),/exactly four/);
});

test('capture copies are immutable from callers; hosted command trace and published metadata use captured exact bytes',t=>{
  const f=fixture(t);f.prepare();const prepared=prepareHostedRestylePack(f.source,f.descriptor,f.pin),first=prepared.metadata();
  first[HOSTED_METADATA_PATHS[0]].fill(0);assert.deepEqual(prepared.metadata()[HOSTED_METADATA_PATHS[0]],f.files.get(HOSTED_METADATA_PATHS[0]));
  f.afterCommand=label=>{if(label==='vite build')put(join(f.source,HOSTED_METADATA_PATHS[0].slice('restyle/'.length)),'changed after capture');};
  buildApp(f.options());assert.deepEqual(f.commands,['vite build','copy-public-app-assets','bundle-assets']);
  for(const path of HOSTED_METADATA_PATHS)assert.deepEqual(readFileSync(join(f.output,path)),f.files.get(path));
  const receipt=JSON.parse(readFileSync(f.receipt));assert.deepEqual(receipt.metadataValidation.metadata,HOSTED_METADATA_PATHS.map(path=>({path,byteLength:f.files.get(path).length,sha256:sha(f.files.get(path))})));
  const published=JSON.parse(readFileSync(join(f.output,HOSTED_METADATA_PATHS[0])));assert.deepEqual(published.items.map(i=>i.game),['cok','dok']);
  const generated=JSON.parse(readFileSync(join(f.output,HOSTED_METADATA_PATHS[3])));assert.equal(generated.imageMode,'bundled');assert.deepEqual(generated.held,f.generated.held);assert.equal(generated.assets[0].runtimeApproved,false);
});

test('default keeps the complete existing command sequence; collision/audit drift never writes receipt',t=>{
  const f=fixture(t);f.hosted=false;f.afterCommand=label=>{if(label==='bundle-restyle-stills')for(const path of HOSTED_METADATA_PATHS)put(join(f.output,path),f.files.get(path));};
  buildApp({...f.options(),env:{GB_APP_OUTPUT:f.output}});assert.deepEqual(f.commands,['vite build','copy-public-app-assets','bundle-assets','bundle-restyle-stills','bundle-cok-title-gallery','bundle-restyle-animations',
    'bundle-cok-combat-restyle','bundle-cok-player-appearance','bundle-cok-dialogue-restyle','bundle-cok-amiga-dialogue18','bundle-cok-travel-restyle','bundle-cok-generated-inventory',
    'bundle-cok-demo-restyle','bundle-cok-amiga-dialogue57','bundle-cok-terrain-restyle','bundle-cok-wall-restyle','bundle-cok-title-restyle']);
  assert.equal(existsSync(f.receipt),false);
  for(const fault of ['collision','audit']){const g=fixture(t);g.prepare();if(fault==='collision')g.afterCommand=label=>{if(label==='bundle-assets')put(join(g.output,HOSTED_METADATA_PATHS[0]),'collision');};
    const options=g.options();if(fault==='audit')options.auditOutput=()=>put(join(g.output,'assets/app.js'),'void 1;');
    assert.throws(()=>buildApp(options),fault==='collision'?/collision/:/changed during audit/);assert.equal(existsSync(g.receipt),false);}
});

test('allowed game metadata bundling removes forbidden files and machine paths without game asset reads',t=>{
  const f=fixture(t),app=join(f.root,'app'),output=join(f.root,'game-output');mkdirSync(join(app,'src/ui'),{recursive:true});mkdirSync(output);
  put(join(app,'src/ui/catalog.ts'),'');put(join(app,'games/cok.json'),json({paletteFrom:'Q:/private/GLIB.DAX',files:[{path:'Q:/private/PIC1.DAX'},{path:'Q:/private/START.EXE'},{path:'Q:/private/SAVGAM.DAT'}]}));
  const stats=bundleAssets({app,repoRoot:join(f.root,'never-read-game-root'),output,includeGameAssets:false});
  const text=readFileSync(join(output,'games/cok.json'),'utf8'),manifest=JSON.parse(text);assert.equal(manifest.paletteFrom,'GLIB.DAX');assert.deepEqual(manifest.files,[{path:'PIC1.DAX'}]);assert.ok(!text.includes('Q:'));assert.equal(stats.metadataOnly,true);
});
