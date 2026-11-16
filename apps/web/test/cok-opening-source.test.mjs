// DOM-free source-admission checks. No Vite, browser, build or game/VM execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { COK_COTTAGE_BASE_SOURCE as base, COK_COTTAGE_SOURCE as source, COK_COTTAGE_RESTYLE as output,
  COK_COTTAGE_LINEAGE as lineage, matchesCokCottageSource, createCokCottageSceneArt,
  loadSelectedCokCottageOriginal, validateCokCottageOutput, requestCokCottageOutput } from '../src/ui/cok-opening-source.mjs';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const approved = read('renders/restyle-site/restyle/out/002_scene_cok_cottage.png');
const original = read('renders/restyle-site/restyle/orig/002_scene_cok_cottage.png');
const registry = JSON.parse(read('docs/engine/research/cok-graphics-identity-registry-v1.json'));
const amigaArchive = readFileSync(registry.assets.find((asset) => asset.id === lineage.sourceAssetId).archive.path);

// Independent RGB/RGBA PNG reader for the existing evidence files, not a production decoder.
function png(bytes) {
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), type = bytes[25];
  assert.equal(bytes[24],8); assert.ok([2,6].includes(type)); assert.equal(bytes[28],0);
  const channels = type === 2 ? 3 : 4, chunks = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at), kind = bytes.toString('ascii',at+4,at+8);
    if (kind === 'IDAT') chunks.push(bytes.subarray(at+8,at+8+length));
    at += length+12;
  }
  const scan = inflateSync(Buffer.concat(chunks)), stride = width*channels, pixels = Buffer.alloc(height*stride);
  assert.equal(scan.length,height*(stride+1));
  const paeth = (a,b,c) => { const p=a+b-c, x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c); return x<=y&&x<=z?a:y<=z?b:c; };
  for (let y=0;y<height;y++) {
    const filter=scan[y*(stride+1)]; assert.ok(filter<=4);
    for (let x=0;x<stride;x++) {
      const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
      pixels[y*stride+x]=(scan[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;
    }
  }
  const rgb=Buffer.alloc(width*height*3);
  for(let i=0;i<width*height;i++) { pixels.copy(rgb,i*3,i*channels,i*channels+3); if(channels===4) assert.equal(pixels[i*channels+3],255); }
  return {width,height,rgb};
}
function nativeRgb(image,x=0,y=0,scale=4) {
  const rgb=Buffer.alloc(304*120*3);
  for(let row=0;row<120;row++) for(let col=0;col<304;col++) {
    const at=((y+row*scale)*image.width+x+col*scale)*3;
    image.rgb.copy(rgb,(row*304+col)*3,at,at+3);
  }
  return rgb;
}
const native = nativeRgb(png(original));
function fixture() {
  const colors=[],lookup=new Map(),indices=new Uint8Array(304*120);
  for(let i=0;i<indices.length;i++) {
    const key=native.subarray(i*3,i*3+3).toString('hex');
    if(!lookup.has(key)) { lookup.set(key,colors.length); colors.push({r:native[i*3],g:native[i*3+1],b:native[i*3+2]}); }
    indices[i]=lookup.get(key);
  }
  const image={width:304,height:120,xOffset:0,yOffset:0,transparentIndex:null,indices,
    palette:{colors,source:'amiga-12bit',firstColor:0,count:32},encoding:'daa-planar5'};
  return {kind:'blocks',blocks:[{blockId:112,image}],frameSet:{frames:new Map([[112,image]])}};
}
function rgba(image) {
  const pixels=new Uint8ClampedArray(image.width*image.height*4);
  for(let i=0;i<image.indices.length;i++) { const c=image.palette.colors[image.indices[i]];pixels.set([c.r,c.g,c.b,255],i*4); }
  return pixels;
}
const load = (options={}) => loadSelectedCokCottageOriginal({assetSource:{readAsset:async(name)=>{
  assert.equal(name,'BIGPIC1.DAA');return amigaArchive;
}},isCurrent:()=>true,decode:()=>fixture(),rgba,...options});
const make = (candidate=base,options={}) => createCokCottageSceneArt(candidate,{loadRestyle:async()=>({unchanged:true}),...options});

test('frozen distinct canonical source/base identities preserve the existing approved counterpart',()=>{
  assert.ok(Object.isFrozen(base)&&Object.isFrozen(source)&&Object.isFrozen(output));
  assert.notEqual(lineage.baseAssetId,lineage.sourceAssetId);assert.notEqual(lineage.baseRgbSha256,lineage.sourceRgbSha256);
  assert.equal(sha(native),lineage.sourceRgbSha256);assert.equal(sha(original),lineage.sourcePngSha256);
  for(const [id,pin] of [[lineage.baseAssetId,lineage.baseRgbSha256],[lineage.sourceAssetId,lineage.sourceRgbSha256]]) {
    assert.equal(registry.assets.find((asset)=>asset.id===id).decoded.pixelSha256,pin);
  }
  const scene=make();assert.equal(scene.source,source);assert.equal(scene.baseSource,base);
  assert.equal(scene.pixelScale,6);assert.deepEqual([scene.x,scene.y],[8,8]);assert.equal(scene.restyleRequiresAmigaOriginal,false);
  assert.equal(scene.amigaOriginal,undefined);assert.equal(scene.loadAmigaOriginal,undefined);
});

test('no numeric-only binding: every exact identity discriminator is required',()=>{
  assert.equal(matchesCokCottageSource({...base,archiveSha256:base.archiveSha256.toUpperCase()}),true);
  for(const candidate of [null,undefined,{blockId:112},source,...Object.entries({game:'dok',system:'Amiga',archive:'BIGPIC2.DAX',
    archiveSha256:'0'.repeat(64),blockId:113,frameIndex:1,blockSha256:'0'.repeat(64)}).map(([key,value])=>({...base,[key]:value}))]) {
    assert.equal(matchesCokCottageSource(candidate),false);
    assert.equal(createCokCottageSceneArt(candidate,{loadRestyle:async()=>null}),undefined);
  }
});

test('actual optional selected archive is exclusive, exact, private and never required for Restyle',async()=>{
  assert.equal(sha(amigaArchive),source.archiveSha256);
  const decoded=fixture();const admitted=await load({decode:()=>decoded});assert.equal(admitted.source,source);
  assert.notEqual(admitted.image,decoded.blocks[0].image);assert.notEqual(admitted.image.indices,decoded.blocks[0].image.indices);
  const scene=make(base,{amigaVariant:admitted});assert.equal(scene.amigaOriginal,admitted.image);
  assert.equal(scene.restyleRequiresAmigaOriginal,false);await scene.loadRestyle();
  const state={picture:112,dialogue:'unchanged',memory:[[1,2]],party:['hero'],mode:'Restyle',fallback:'DOS-EGA'};
  const before=structuredClone(state);await make().loadRestyle();assert.deepEqual(state,before);
  assert.equal(await load({assetSource:null}),undefined);
  assert.equal(await load({assetSource:{readAsset:async()=>null}}),undefined);
  assert.equal(await load({assetSource:{readAsset:async()=>{throw new Error('unavailable');}}}),undefined);
  const changed=Buffer.from(amigaArchive);changed[changed.length-1]^=1;
  assert.equal(await load({assetSource:{readAsset:async()=>changed},decode:()=>{throw new Error('must not decode foreign archive');}}),undefined);
});

test('stale selected source/mount results and ambiguous/frame/geometry/pixel evidence never attach',async()=>{
  let current=false,reads=0;
  assert.equal(await load({isCurrent:()=>current,assetSource:{readAsset:async()=>{reads++;return amigaArchive;}}}),undefined);assert.equal(reads,0);
  current=true;
  assert.equal(await load({isCurrent:()=>current,assetSource:{readAsset:async()=>{current=false;return amigaArchive;}}}),undefined);
  current=true;assert.equal(await load({isCurrent:()=>current,decode:()=>{current=false;return fixture();}}),undefined);
  for(const mutation of ['duplicate','missing','mapFrame1','width','offset','indices','alpha','palette']) {
    const decoded=fixture(),image=decoded.blocks[0].image;
    if(mutation==='duplicate') decoded.blocks.push({...decoded.blocks[0]});
    if(mutation==='missing') decoded.blocks=[];
    if(mutation==='mapFrame1') decoded.frameSet.frames.set(112,{...image});
    if(mutation==='width') image.width=303;
    if(mutation==='offset') image.xOffset=1;
    if(mutation==='indices') image.indices[0]^=1;
    if(mutation==='palette') image.palette.colors[0].r^=1;
    assert.equal(await load({decode:()=>decoded,...(mutation==='alpha'?{rgba:(img)=>{const p=rgba(img);p[3]=0;return p;}}:{})}),undefined,mutation);
  }
  assert.throws(()=>make(base,{amigaVariant:{source:base,image:fixture().blocks[0].image}}),/Amiga geometry/);
});

test('production generic selector still rejects duplicate source bindings without resolver changes',()=>{
  const text=read('apps/web/src/ui/dialogue.ts').toString();
  const pure=text.slice(text.indexOf('function selectedSceneArt('),text.indexOf('\nfunction sceneArtKey('))
    .replace('current: DlgState','current').replace(': DialogueSceneArt | undefined','');
  const key=(s)=>JSON.stringify([s.game,s.system,s.archive,s.archiveSha256.toLowerCase(),s.blockId,s.frameIndex,s.blockSha256?.toLowerCase()??null]);
  const select=new Function('dialoguePictureSourceKey',`${pure};return selectedSceneArt;`)(key);
  const current={currentPictureId:112,currentPictureSource:base,presentation:{sceneArt:make()}};
  assert.equal(select(current),current.presentation.sceneArt);
  assert.equal(select({...current,currentPictureSource:null}),undefined);
  assert.equal(select({...current,currentPictureSource:{...base,archive:'BIGPIC2.DAX'}}),undefined);
  assert.equal(select({...current,presentation:{sceneArts:[make(),make()]}}),undefined);
  assert.match(text,/if \(state\.artMode\.kind === 'restyle' && sourceReadyForRestyle && !loadedRestyle\) requestSceneRestyle/);
  assert.match(text,/current\.pictureRevision === revision/);
});

test('existing production output request rejects stale results and preserves requested mode/game state on failure',async()=>{
  const text=read('apps/web/src/ui/dialogue.ts').toString();
  // Evaluate the unchanged production body with DOM-free collaborators; strip only its types.
  const body=text.slice(text.indexOf('function requestSceneRestyle('),text.indexOf('\nfunction requestSceneAmigaOriginal('))
    .replace('current: DlgState','current').replace('scene: DialogueSceneArt','scene')
    .replace('): void {',') {').replace('(): boolean =>','() =>').replace('(error: unknown)','(error)')
    .replaceAll('selectedSceneArt(current)!','selectedSceneArt(current)');
  let packRevision=0;
  const invoke=(current)=>new Function('state','selectedSceneArt','sceneArtKey','renderPresentation','localAssetPackRevision',
    `${body};return requestSceneRestyle;`)(current,(s)=>s.scene,(s)=>s.comparisonId,()=>{},()=>packRevision);
  const current=()=>({scene:null,loadedRestyles:new Map(),artLoading:new Map(),artErrors:new Map(),pictureRevision:1,
    lastTurn:{text:'same',choices:['Continue']},artMode:{kind:'restyle'},memory:[[1,2]],party:['hero']});
  const failed=current();const bad=make(base,{loadRestyle:async()=>{throw new Error('unavailable');}});failed.scene=bad;
  const before=JSON.stringify({turn:failed.lastTurn,mode:failed.artMode,memory:failed.memory,party:failed.party});
  invoke(failed)(failed,bad);await new Promise(setImmediate);
  assert.equal(failed.loadedRestyles.size,0);assert.equal(failed.artErrors.get(bad.comparisonId),'unavailable');
  assert.equal(JSON.stringify({turn:failed.lastTurn,mode:failed.artMode,memory:failed.memory,party:failed.party}),before);
  const stale=current();let finish;const scene=make(base,{loadRestyle:()=>new Promise((resolve)=>{finish=resolve;})});stale.scene=scene;
  invoke(stale)(stale,scene);stale.pictureRevision++;finish({unreviewedForNewPicture:true});await new Promise(setImmediate);
  assert.equal(stale.loadedRestyles.size,0);assert.equal(stale.artErrors.size,0);
  const replacedPack=current();let finishFromOldPack;const oldPackScene=make(base,{loadRestyle:()=>new Promise((resolve)=>{finishFromOldPack=resolve;})});
  replacedPack.scene=oldPackScene;invoke(replacedPack)(replacedPack,oldPackScene);packRevision++;
  finishFromOldPack({fromReplacedPack:true});await new Promise(setImmediate);
  assert.equal(replacedPack.loadedRestyles.size,0);assert.equal(replacedPack.artErrors.size,0);
});

test('production request guard fetches only Restyle with the exact base and validates output bytes',async()=>{
  let calls=0;const fetchImage=async()=>{calls++;return new Response(approved,{headers:{'content-type':'image/png'}});};
  for(const mode of ['DOS-EGA','Amiga','unknown']) assert.equal(await requestCokCottageOutput({mode,baseSource:base,fetchImage,url:'unchanged'}),null);
  assert.equal(await requestCokCottageOutput({mode:'Restyle',baseSource:{blockId:112},fetchImage,url:'unchanged'}),null);assert.equal(calls,0);
  const bytes=await requestCokCottageOutput({mode:'Restyle',baseSource:base,fetchImage,url:'unchanged'});
  assert.equal(calls,1);assert.equal(sha(bytes),output.sha256);assert.notEqual(bytes,approved);
  assert.equal(sha(await validateCokCottageOutput(approved)),output.sha256);
});

test('wrong output hash/signature/type/geometry, missing HTTP and bad MIME fail closed',async()=>{
  for(const [offset,value] of [[0,0],[24,16],[25,6],[28,1],[19,31],[23,209],[100,approved[100]^1]]) {
    const bytes=Buffer.from(approved);bytes[offset]=value;await assert.rejects(validateCokCottageOutput(bytes),/reviewed/);
  }
  await assert.rejects(validateCokCottageOutput(new Uint8Array(8*1024*1024+1)),/size limit/);
  const state={picture:112,text:'same',memory:[1,2],requested:'Restyle',fallback:'DOS-EGA'},before=structuredClone(state);
  for(const response of [new Response(null,{status:404}),new Response(approved,{headers:{'content-type':'text/plain'}}),
    new Response(approved,{headers:{'content-length':String(9*1024*1024)}}),new Response(new Uint8Array([0,1,2]))]) {
    await assert.rejects(requestCokCottageOutput({mode:'Restyle',baseSource:base,fetchImage:async()=>response,url:'unchanged'}));
    assert.deepEqual(state,before);
  }
});

test('fresh prompt/input and full manifest crop retain exact Amiga source provenance',()=>{
  const prompt=readFileSync('C:/GoldBoxImg/batch01/002_scene_cok_cottage_prompt.txt');
  const input=readFileSync('C:/GoldBoxImg/batch01/002_scene_cok_cottage_input.png');
  assert.equal(sha(prompt),lineage.promptSha256);assert.equal(sha(input),lineage.inputSha256);
  const item=JSON.parse(read('renders/restyle-site/restyle/manifest.json')).items.find((i)=>i.id==='scene_cok_cottage');
  assert.deepEqual(item.box,[8,212,1520,600]);assert.equal(item.src,'renders/daa/BIGPIC1_ChampionsOfKrynn/BIGPIC1_112.png');
  assert.deepEqual([item.native_w,item.native_h,item.k,item.transparent],[304,120,6,false]);
  const image=png(input);assert.deepEqual([image.width,image.height],[1536,1024]);
  assert.equal(sha(nativeRgb(image,8,212,5)),lineage.sourceRgbSha256);
  assert.notEqual(sha(nativeRgb(image,13,212,5)),lineage.sourceRgbSha256);
  // Compare the entire 5x crop, not only sampled native pixels.
  for(let y=0;y<600;y++) for(let x=0;x<1520;x++) {
    const src=(Math.floor(y/5)*304+Math.floor(x/5))*3,dst=((212+y)*image.width+8+x)*3;
    assert.ok(image.rgb.subarray(dst,dst+3).equals(native.subarray(src,src+3)));
  }
});

test('production opening attaches only a qualified scene and captures install before awaits',()=>{
  const text=read('apps/web/src/ui/explore.ts').toString();
  const opening=text.slice(text.indexOf('async function startCokRetailCampaign('),text.indexOf('\n/**\n * R3 negative-arm entry:'));
  assert.ok(opening.indexOf('const presentationAssetSource = activeAssetSource;')<opening.indexOf('await Promise.all'));
  assert.match(opening,/activeAssetSource === presentationAssetSource/);
  assert.match(opening,/const cottageBaseSource = pictureSources\.get\(112\)/);
  assert.match(opening,/loadCokCottageSelectedOriginal\(presentationAssetSource, presentationIsCurrent\)/);
  assert.match(opening,/\.\.\.\(cottageScene \? \{ sceneArt: cottageScene \} : \{\}\)/);
  assert.doesNotMatch(opening,/loadRestyle: loadCokCottageRestyle|frameSet\.frames\.get\(112\)/);
  const wrapper=read('apps/web/src/ui/cokOpeningArt.ts').toString();
  assert.match(wrapper,/createCokCottageSceneArt\(baseSource/);assert.match(wrapper,/requestCokCottageOutput/);
});
