// Focused exact-source DOS CoK wall blit gate; no retail save/native execution.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import { bundleCokWallRestyle, dedupeCokWallCandidates } from '../scripts/bundle-cok-wall-restyle.mjs';
const manifest = JSON.parse(readFileSync(new URL('../src/ui/cokWallRestyleManifest.json', import.meta.url)));
const tiles = manifest.banks.flatMap((bank) => bank.tiles);
const uniqueTiles = dedupeCokWallCandidates();
const identityRefs = manifest.banks.flatMap((bank) => bank.tiles.map((tile) => ({ archive: manifest.archive, sourceArchiveSha256: manifest.sourceArchiveSha256, blockId: bank.blockId, tileIndex: tile.tileIndex })));
const identityLabel = (ref) => `${ref.archive}#${ref.blockId}:${ref.tileIndex}`;
// This manifest is imported by runtime JS: provenance must never embed a local machine root.
const manifestStrings=(value)=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(manifestStrings):[];
for(const value of manifestStrings(manifest))assert.doesNotMatch(value,/^(?:[A-Za-z]:[\\/]|[\\/])|GoldBoxImg|generated_images/i,'runtime provenance must contain stable relative identities, not local workspace paths');
for(const tile of tiles)assert.match(tile.provenance.aliasSourceSha256,/^[0-9a-f]{64}$/,'alias source/atlas must retain its exact hash');
let server, browser;
let base = process.env.GB_COK_WALL_BASE_URL?.replace(/\/+$/, '');
const external = !!base;
let corrupt = false;
let delay = false;
let delayed = [];
let delayedReady;
try {
  assert.equal(tiles.length,210);assert.equal(uniqueTiles.length,177);
  assert.equal(dedupeCokWallCandidates([...tiles,tiles[0]]).length,177,'identical output aliases must package once');
  assert.throws(()=>dedupeCokWallCandidates([...tiles,{...tiles[0],sha256:'0'.repeat(64)}]),/Conflicting CoK wall output path/);
  assert.throws(()=>dedupeCokWallCandidates([...tiles,{...tiles[0],pixelScale:4}]),/Conflicting CoK wall output path/);
  const packageRoot=mkdtempSync(join(tmpdir(),'gb-cok-walls-')),packageSource=join(packageRoot,'source'),packageOutput=join(packageRoot,'output');
  mkdirSync(packageSource);mkdirSync(packageOutput);
  for(const tile of tiles)copyFileSync(`C:/GoldBoxImg/cok_restyle_work/done/${tile.stem}.png`,join(packageSource,`${tile.stem}.png`));
  assert.equal(bundleCokWallRestyle(packageSource,packageOutput),177);
  assert.equal(readdirSync(join(packageOutput,'restyle/cok/walls')).length,177,'package must contain exactly the unique declared PNGs');
  const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  for(const tile of tiles)assert.equal(sha(readFileSync(join(packageOutput,'restyle/cok/walls',`${tile.stem}.png`))),tile.sha256);
  const firstPath=join(packageSource,`${tiles[0].stem}.png`),firstBytes=readFileSync(firstPath);
  const badHash=Buffer.from(firstBytes);badHash[badHash.length-1]^=1;writeFileSync(firstPath,badHash);
  assert.throws(()=>bundleCokWallRestyle(packageSource,packageOutput),/SHA-256 differs/);
  const badGeometry=Buffer.from(firstBytes);badGeometry.writeUInt32BE(65,16);writeFileSync(firstPath,badGeometry);
  assert.throws(()=>bundleCokWallRestyle(packageSource,packageOutput),/dimensions/);
  assert.equal(sha(readFileSync(join(packageOutput,'restyle/cok/walls',`${tiles[0].stem}.png`))),tiles[0].sha256);
  if (!base) {
    const probe = net.createServer();
    await new Promise((done) => probe.listen(0, '127.0.0.1', done));
    const port = probe.address().port;
    await new Promise((done) => probe.close(done));
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
    let log = '';
    for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += chunk; });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try { ready = (await fetch(base)).ok && log.includes(`127.0.0.1:${port}`); } catch { /* starting */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(ready, log);
  }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (!external) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      const tile = tiles.find((tile) => path === `/restyle/cok/walls/${tile.stem}.png`);
      if (tile) {
        const bytes = readFileSync(`C:/GoldBoxImg/cok_restyle_work/done/${tile.stem}.png`);
        if (corrupt) bytes[bytes.length - 1] ^= 1;
        const respond = () => request.respond({ status: 200, contentType: 'image/png', body: bytes });
        if (delay) { delayed.push(respond); if(delayed.length===tiles.length)delayedReady?.(); } else void respond();
      } else void request.continue();
    });
  }
  await page.evaluateOnNewDocument(() => { localStorage.clear(); localStorage.setItem('greybox.graphics.cok-natural', 'DOS-EGA'); });
  const openRoute = async () => {
    await page.goto(`${base}/?explore=cok-natural`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.__explore?.wallRestyleIds().length === 210', { timeout: 45000 });
  };
  await openRoute();
  assert.deepEqual(await page.evaluate(() => window.__explore.wallRestyleErrors()), {});
  assert.deepEqual((await page.evaluate(() => window.__explore.wallRestyleIds())).map(identityLabel).sort(), identityRefs.map(identityLabel).sort());
  for(const ref of await page.evaluate(()=>window.__explore.wallRestyleIds()))assert.equal(ref.sourceArchiveSha256,manifest.sourceArchiveSha256);
  const snapshot = (key) => page.evaluate(async (key) => {
    const canvas = document.querySelector('.gb-screen .gb-emu canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    if (key) window[key] = { pixels, width: canvas.width, height: canvas.height };
    return { hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join(''), pose: window.__explore.getPose(),
      time: window.__explore.clockMinutes(), messages: window.__explore.messages(),
      steps: window.__explore.stepCount(), visited: window.__explore.automapVisitedCount(),
      partyHp: window.__explore.partyHp(), menuMode: window.__explore.menuMode(),
      memory: [0x4c55,0x4c56,0x4be7,0x4be8].map((address) => window.__explore.areaMemory(address)),
      doors: ['north','east','south','west'].map((direction) => window.__explore.doorOpen(direction)),
      combat: window.__explore.combatOpen(), area: window.__explore.currentArea() };
  }, key);
  const select = async (label) => {
    await page.evaluate((label) => {
      const button = [...document.querySelectorAll('.gb-scaler button')].find((button) => button.textContent.trim() === label);
      if (!button) throw new Error(`Missing graphics button ${label}`);
      button.click();
    }, label);
  };
  // Block 23 is the visible native near wall at the start; #31/#32 remain occluded behind it.
  const startDos=await snapshot();
  await select('Restyle');
  const startRestyle=await snapshot();
  const startIdentities=await page.evaluate(()=>window.__explore.wallRestyleVisibleTiles());
  assert.notEqual(startRestyle.hash,startDos.hash,'visible near block23 art must change the starting view');
  assert.deepEqual({...startRestyle,hash:''},{...startDos,hash:''},'the block23 start-view switch must preserve gameplay state');
  assert.ok(startIdentities.some(ref=>ref.blockId===23),'block23 must own the native near wall at the starting pose');
  assert.ok(startIdentities.every(ref=>ref.blockId===23),'the starting block23 wall must occlude #31/#32');
  await select('DOS · EGA');assert.deepEqual(await snapshot(),startDos);
  await select('Restyle');
  // Source-proven legal same-area path avoiding the observed encounter cells (14,12)/(6,13).
  const routeActions = ['left','forward','left','forward','forward','right','forward'];
  const walked=[];
  for(const action of routeActions){
    await page.evaluate((action)=>window.__explore.move(action),action);walked.push(action);
    await page.waitForFunction('!window.__explore.combatLaunchPending() && window.__explore.campaignRemountPending() === 0', {timeout:10000});
    if(await page.evaluate(()=>window.__explore.combatOpen()))throw new Error('Encounter opened before a visible #31 wall pose');
    assert.equal(await page.evaluate(()=>!!window.__dialogue),false,'route must not enter another event dialogue');
    assert.deepEqual(await page.evaluate(()=>window.__explore.currentArea()),{disk:1,areaId:34},'every legal step must remain on ECL1#34');
  }
  assert.ok(await page.evaluate(()=>window.__explore.wallRestyleVisibleTiles().some(ref=>ref.blockId===31)),'known legal ECL1#34 route must retain actual visible #31 wall pixels');
  assert.ok(await page.evaluate(()=>window.__explore.wallRestyleVisibleTiles().some(ref=>ref.blockId===32)),'same real pose must independently expose block32 source identities');
  console.log('Admitted wall pose',await page.evaluate(()=>window.__explore.getPose()),'legal actions',walked.join(','));
  await select('DOS · EGA');
  const observed = new Set();
  const bankPixelRows=[];
  let changedViews=0;
  for (let rotation = 0; rotation < 4; rotation++) {
    const dos = await snapshot('wallDos');
    await select('Restyle');
    await page.waitForFunction('localStorage.getItem("greybox.graphics.cok") === "Restyle"');
    assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok-natural")'), 'DOS-EGA', 'Canonical preference writes preserve the migrated legacy key');
    const restyle = await snapshot('wallRestyle');
    if(restyle.hash!==dos.hash)changedViews++;
    assert.deepEqual({ ...restyle, hash: '' }, { ...dos, hash: '' }, 'graphics switches must preserve all observed gameplay state');
    for (const identity of await page.evaluate(() => window.__explore.wallRestyleVisibleTiles())) observed.add(identityLabel(identity));
    const bankPixels=await page.evaluate(()=>Object.entries(window.__explore.wallRestyleVisiblePixelsByIdentity()).reduce((totals,[key,count])=>{
      const block=Number(key.match(/#(\d+):/)[1]);totals[block]=(totals[block]??0)+count;return totals;
    },{31:0,32:0}));
    assert.equal(bankPixels[31],[36,576,896,0][rotation],'#31 final source-pixel coverage must remain unchanged');
    assert.ok(bankPixels[32]>0,'#32 must independently own unobscured source pixels in each real direction');
    bankPixelRows.push(bankPixels);
    const differences = await page.evaluate(() => {
      const before = window.wallDos, after = window.wallRestyle;
      const rect = window.__explore.displayRect(), dpr = devicePixelRatio || 1;
      let inside = 0, outside = 0;
      // The 120px explore viewport is further masked by its inner frame. Outside this box
      // every native UI pixel must be identical despite the higher-resolution wall surface.
      for (let y=0;y<before.height;y++) for(let x=0;x<before.width;x++) {
        const i=(y*before.width+x)*4;
        if (![0,1,2,3].some((c)=>before.pixels[i+c]!==after.pixels[i+c])) continue;
        const nx=(x/dpr-rect.x)*320/rect.width, ny=(y/dpr-rect.y)*200/rect.height;
        if(nx>=8&&nx<128&&ny>=8&&ny<128)inside++;else outside++;
      }
      return {inside,outside};
    });
    assert.equal(differences.outside,0,'wall art must never cover HUD/chrome outside viewport');
    console.log(`direction ${rotation}: changed viewport pixels ${differences.inside}; final source pixels31=${bankPixels[31]},32=${bankPixels[32]}`);
    await select('DOS · EGA');
    assert.deepEqual(await snapshot(),dos,'DOS canvas and game state must restore exactly');
    await page.evaluate(() => window.__explore.move('right'));
  }
  assert.ok(changedViews>0,'at least one actual ECL1#34 direction must visibly render new wall art');
  assert.ok(observed.size>1,'real route must render multiple admitted local tiles');
  console.log(`Natural ECL1#34 visible local wall tiles across four directions: ${[...observed].sort().join(',')}`);
  assert.ok([...observed].some(label=>label.includes('#31:')));assert.ok([...observed].some(label=>label.includes('#32:')));

  // Ordinary slot7 door traversal from the same legal route, with no pose/state injection.
  await page.evaluate(()=>{window.__explore.move('right');window.__explore.move('right');});
  assert.deepEqual(await page.evaluate(()=>window.__explore.getPose()),{x:12,y:12,facing:'east'});
  assert.equal(await page.evaluate(()=>window.__explore.doorOpen('east')),false,'slot7 east door starts closed');
  const doorDos=await snapshot();
  await select('Restyle');
  const doorRestyle=await snapshot();
  assert.deepEqual({...doorRestyle,hash:''},{...doorDos,hash:''},'graphics selection must preserve the closed door and gameplay state');
  const doorTiles=await page.evaluate(()=>window.__explore.wallRestyleVisibleTiles().filter(ref=>ref.blockId===32).map(ref=>ref.tileIndex));
  for(const local of[6,9,11])assert.ok(doorTiles.includes(local),`slot7 east view must visibly own block32 local${local}`);
  await select('DOS · EGA');assert.deepEqual(await snapshot(),doorDos,'closed-door DOS pixels/state must restore exactly');
  await select('Restyle');assert.deepEqual(await snapshot(),doorRestyle);
  await page.evaluate(()=>window.__explore.move('forward'));
  await page.waitForFunction('!window.__explore.combatLaunchPending() && window.__explore.campaignRemountPending() === 0',{timeout:10000});
  assert.deepEqual(await page.evaluate(()=>window.__explore.getPose()),{x:13,y:12,facing:'east'},'ordinary forward input must cross the slot7 door');
  assert.equal(await page.evaluate(()=>window.__explore.doorOpen('west')),true,'arrival cell reports its west door open');
  assert.deepEqual(await page.evaluate(()=>window.__explore.currentArea()),{disk:1,areaId:34});
  assert.equal(await page.evaluate(()=>window.__explore.combatOpen()),false);
  assert.equal(await page.evaluate(()=>!!window.__dialogue),false);
  const crossedRestyle=await snapshot();
  assert.equal(crossedRestyle.time,doorRestyle.time+1,'ordinary crossing consumes one normal movement minute');
  assert.equal(crossedRestyle.steps,doorRestyle.steps+1,'ordinary crossing emits exactly one movement step');
  assert.deepEqual(crossedRestyle.partyHp,doorRestyle.partyHp);
  await select('DOS · EGA');const crossedDos=await snapshot();
  assert.deepEqual({...crossedDos,hash:''},{...crossedRestyle,hash:''},'graphics switch must preserve the arrival door/game state');
  await select('Restyle');assert.deepEqual(await snapshot(),crossedRestyle);
  await select('DOS · EGA');assert.deepEqual(await snapshot(),crossedDos,'arrival DOS pixels/state must restore exactly');
  console.log('Slot7 door:12,12 east/closed -> ordinary forward ->13,12 east/west-open; DOS/Restyle switches preserve door/game state.');

  // The west-facing arrival view selects the other actual door edge: WALLDEF23 / block23.
  await page.evaluate(()=>{window.__explore.move('right');window.__explore.move('right');});
  assert.deepEqual(await page.evaluate(()=>window.__explore.getPose()),{x:13,y:12,facing:'west'});
  assert.equal(await page.evaluate(()=>window.__explore.doorOpen('west')),true);
  const slot15Dos=await snapshot();
  await select('Restyle');
  const slot15Restyle=await snapshot();
  assert.notEqual(slot15Restyle.hash,slot15Dos.hash,'the real slot15/#23 view must change visible pixels');
  assert.deepEqual({...slot15Restyle,hash:''},{...slot15Dos,hash:''},'slot15 graphics switch must preserve gameplay state');
  const slot15Tiles=await page.evaluate(()=>window.__explore.wallRestyleVisibleTiles().filter(ref=>ref.blockId===23).map(ref=>ref.tileIndex));
  assert.ok(slot15Tiles.length>0,'the real west-facing door view must visibly own block23 pixels');
  await select('DOS · EGA');assert.deepEqual(await snapshot(),slot15Dos,'slot15 DOS pixels/state must restore exactly');
  console.log(`Slot15 door:13,12 west/open; visible block23 source tiles ${slot15Tiles.join(',')}.`);

  if (!external) {
    // Hold one complete mount's art, then finish a later mount first. A stale completion must
    // neither attach to the later scene nor repaint it. Observe the actual visible canvas API.
    await page.setCacheEnabled(false);
    delay=true;delayed=[];
    let pendingTimer;
    const allDelayed=new Promise((done,reject)=>{
      delayedReady=()=>{clearTimeout(pendingTimer);done();};
      pendingTimer=setTimeout(()=>reject(new Error(`Expected${tiles.length} held art requests; got${delayed.length}`)),10000);
    });
    await page.evaluate(()=>window.__explore.switchArea(1,34));
    await allDelayed;
    delay=false;
    await page.evaluate(()=>window.__explore.switchArea(1,34));
    await page.waitForFunction('window.__explore.wallRestyleIds().length === 210',{timeout:30000});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const beforeStale=await snapshot();
    await page.evaluate(()=>{
      window.wallStalePaints=0;window.wallStaleDecodes=0;
      const canvas=document.querySelector('.gb-screen .gb-emu canvas'),context=canvas.getContext('2d');
      window.wallDrawImage=context.drawImage;
      context.drawImage=function(...args){window.wallStalePaints++;return window.wallDrawImage.apply(this,args);};
      window.wallImageBitmap=createImageBitmap;
      window.createImageBitmap=async(...args)=>{const bitmap=await window.wallImageBitmap(...args);window.wallStaleDecodes++;return bitmap;};
    });
    await Promise.all(delayed.map(respond=>respond()));
    await page.waitForFunction('window.wallStaleDecodes === 210',{timeout:30000});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    assert.equal(await page.evaluate(()=>window.wallStalePaints),0,'stale mount art must not repaint the current scene');
    assert.deepEqual(await snapshot(),beforeStale,'stale mount completion must preserve the actual current canvas and gameplay state');
    await page.evaluate(()=>{
      document.querySelector('.gb-screen .gb-emu canvas').getContext('2d').drawImage=window.wallDrawImage;
      window.createImageBitmap=window.wallImageBitmap;
    });
    console.log('Stale art mount:210 delayed older outputs decoded after a later mount;0 current-canvas repaints and identical state/pixels.');
    const controls = await page.evaluate(async (manifest) => {
      const tiles = manifest.banks.flatMap(bank => bank.tiles);
      const engine = await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts');
      const module = await import('/src/ui/cokWallRestyle.ts');
      const get = async (name) => new Uint8Array(await (await fetch(`/@fs/C:/Modding/GoldBox/Champions%20of%20Krynn/${name}`)).arrayBuffer());
      const tileBytes=await get('8X8D1.DAX'), blocks=new Map(engine.readDaxDataBlocks(tileBytes).map((b)=>[b.blockId,b.raw]));
      if(!await module.registerCokWallArchive(tileBytes,blocks,'Champions of Krynn/8X8D1.DAX'))throw new Error('exact archive/block pins must register');
      const wd=new Map(engine.readDaxDataBlocks(await get('WALLDEF1.DAX')).map((b)=>[b.blockId,b.raw]));
      const geo=new Map(engine.readDaxDataBlocks(await get('GEO1.DAX')).map((b)=>[b.blockId,b.raw]));
      const ecl=new Map(engine.readDaxDataBlocks(await get('ECL1.DAX')).map((b)=>[b.blockId,b.raw]));
      const sourceDungeon=engine.loadDungeon(ecl.get(34),{geoBlock:id=>geo.get(id)??null,walldefBlock:id=>wd.get(id)??null,tileBlock:id=>blocks.get(id)??null});
      const doorSource=sourceDungeon.map.cells[12*sourceDungeon.map.width+12];
      if(doorSource.walls.east!==7||!(doorSource.doors?.east>0))throw new Error('ECL1#34 source must identify the slot7 east door at12,12');
      const routing=engine.wallSlotRouting(7);
      if(routing.wallset!==1||routing.slice!==1)throw new Error('slot7 source must select wallset1/slice1');
      if(sourceDungeon.walls.tileSets[2].tiles.some(image=>sourceDungeon.walls.tileOrigin(image).blockId!==32))throw new Error('slot7 wallset must retain actual block32 origin');
      const door23=sourceDungeon.map.cells[12*sourceDungeon.map.width+13];
      if(door23.walls.west!==15||!(door23.doors?.west>0))throw new Error('ECL1#34 source must identify the slot15 west door at13,12');
      const route23=engine.wallSlotRouting(15);
      if(route23.wallset!==2||route23.slice!==4)throw new Error('slot15 source must select WALLDEF23 slice4');
      if(sourceDungeon.walls.tileSets[3].tiles.some(image=>sourceDungeon.walls.tileOrigin(image).blockId!==23))throw new Error('slot15 wallset must retain actual block23 origin');
      const wrongBlock=new Uint8Array(blocks.get(31));wrongBlock[wrongBlock.length-1]^=1;
      const wrongBlocks=new Map(blocks);wrongBlocks.set(31,wrongBlock);
      if(await module.registerCokWallArchive(tileBytes,wrongBlocks,'Champions of Krynn/8X8D1.DAX'))throw new Error('correct archive with wrong decompressed block must not register');
      const wrongWalls=engine.loadDungeonWalls([3,255,255],{walldefBlock:(id)=>wd.get(id)??null,tileBlock:(id)=>wrongBlocks.get(id)??null});
      const wrongLoaded=await module.loadCokWallRestyles(wrongWalls);
      if(wrongLoaded.art.size!==70||[...wrongLoaded.art.keys()].some(image=>wrongWalls.tileOrigin(image).blockId!==32))throw new Error('mismatched block31 must remain unmapped while valid32 remains admitted');
      const wrongBlock32=new Uint8Array(blocks.get(32));wrongBlock32[wrongBlock32.length-1]^=1;
      const wrongBlocks32=new Map(blocks);wrongBlocks32.set(32,wrongBlock32);
      if(await module.registerCokWallArchive(tileBytes,wrongBlocks32,'Champions of Krynn/8X8D1.DAX'))throw new Error('wrong decompressed block32 must fail its pin');
      const wrongWalls32=engine.loadDungeonWalls([3,255,255],{walldefBlock:(id)=>wd.get(id)??null,tileBlock:(id)=>wrongBlocks32.get(id)??null});
      const wrongLoaded32=await module.loadCokWallRestyles(wrongWalls32);
      if(wrongLoaded32.art.size!==70||[...wrongLoaded32.art.keys()].some(image=>wrongWalls32.tileOrigin(image).blockId!==31))throw new Error('wrong32 must fall back without losing31');
      const walls=engine.loadDungeonWalls([3,255,255],{walldefBlock:(id)=>wd.get(id)??null,tileBlock:(id)=>blocks.get(id)??null});
      const loaded=await module.loadCokWallRestyles(walls);
      if(loaded.art.size!==140||loaded.errors.size)throw new Error('direct real wall source failed');
      const image4=[...loaded.art.keys()].find((image)=>walls.tileOrigin(image).blockId===31&&walls.tileOrigin(image).tileIndex===4);
      if(image4.indices[15]!==13)throw new Error('tile4 source key fixture wrong');
      const art4=loaded.art.get(image4);
      for(let y=8;y<16;y++)for(let x=56;x<64;x++)if(art4.pixels[(y*64+x)*4+3]!==0)throw new Error('opaque output texture escaped tile4 source(7,1) alpha');
      let maskedCells=0;
      for(const [image,art]of loaded.art)for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const expected=image.indices[Math.floor(y/8)*8+Math.floor(x/8)]===13?0:255;
        if(art.pixels[(y*64+x)*4+3]!==expected)throw new Error('source alpha expansion differs');
        if(expected===0)maskedCells++;
      }
      const source={game:'cok',system:'DOS-EGA',archive:'8X8D1.DAX',archiveSha256:manifest.sourceArchiveSha256,blockId:31,tileIndex:4};
      for(const[key,value]of Object.entries({game:'dok',system:'Amiga',archive:'8X8D2.DAX',archiveSha256:'0'.repeat(64),blockId:24,tileIndex:70}))if(module.cokWallRestyleIdentity({...source,[key]:value}))throw new Error(`wrong ${key} admitted`);
      const bad={...image4,indices:new Uint8Array(image4.indices)};bad.indices[0]^=1;
      let badRejected=false;try{await module.loadCokWallRestyle(module.cokWallRestyleIdentity(source),bad);}catch{badRejected=true;}if(!badRejected)throw new Error('wrong source pixels admitted');
      const first31=[...loaded.art.keys()].find(image=>walls.tileOrigin(image).blockId===31&&walls.tileOrigin(image).tileIndex===0);
      const id31=module.cokWallRestyleIdentity({...source,tileIndex:0}),id32=module.cokWallRestyleIdentity({...source,blockId:32,tileIndex:0});
      if(!id31||!id32||module.cokWallRestyleKey(id31)===module.cokWallRestyleKey(id32))throw new Error('same local tile from different banks must have different identities');
      let wrongBankRejected=false;try{await module.loadCokWallRestyle(id32,first31);}catch{wrongBankRejected=true;}
      if(!wrongBankRejected)throw new Error('bank32 identity must not accept bank31 source pixels');
      const spoofWalls={...walls,tileOrigin:(image)=>{const origin=walls.tileOrigin(image);return origin?{...origin,blockId:32}:null;}};
      if(module.wallIdentityForImage(spoofWalls,first31))throw new Error('raw block31 must not inherit a spoofed block32 label');
      for(const image of walls.tileSets.flatMap((set)=>set?.tiles??[])){
        const origin=walls.tileOrigin(image);if(origin&&![23,31,32].includes(origin.blockId)&&module.wallIdentityForImage(walls,image))throw new Error('other wall bank admitted');
      }
      const walls23=engine.loadDungeonWalls([23,255,255],{walldefBlock:(id)=>wd.get(id)??null,tileBlock:(id)=>blocks.get(id)??null});
      const loaded23=await module.loadCokWallRestyles(walls23);
      if(loaded23.art.size!==70||[...loaded23.art.keys()].some(image=>walls23.tileOrigin(image).blockId!==23))throw new Error('bank23 must admit only its 70 pinned tiles');
      let masked23=0;
      for(const [image,art] of loaded23.art)for(let y=0;y<64;y++)for(let x=0;x<64;x++){
        const expected=image.indices[Math.floor(y/8)*8+Math.floor(x/8)]===13?0:255;
        if(art.pixels[(y*64+x)*4+3]!==expected)throw new Error('block23 alpha must expand its exact source-index13 mask');
        if(expected===0)masked23++;
      }
      // Independent occlusion control: an admitted far wall under an unadmitted native near wall.
      const cells=Array.from({length:256},()=>({walls:{north:0,east:0,south:0,west:0},floor:0,ceiling:0}));
      for(let x=4;x<=12;x++)cells[6*16+x].walls.north=1;
      cells[7*16+8].walls.north=6; // slots1..5 route wallset0; slot6 starts wallset1.
      const map={width:16,height:16,cells,name:'bounded occlusion fixture'};
      const farImage=[...loaded.art.keys()].find(image=>walls.tileOrigin(image).blockId===31&&image.indices.every(index=>index!==13));
      const farIndex=walls.tileOrigin(farImage).tileIndex;
      const nearIndex=walls.tileSets[2].tiles.findIndex(image=>image.indices.some(index=>index!==13));
      const fixtureWalls={...walls,readId:(wallset)=>wallset===0?46+farIndex:116+nearIndex};
      const farArt=loaded.art.get(farImage);
      const texture={...farArt,pixels:new Uint8ClampedArray(farArt.pixels)};
      for(let i=0;i<texture.pixels.length;i+=4){texture.pixels[i]=17;texture.pixels[i+1]=123;texture.pixels[i+2]=231;}
      const fixtureLoaded={art:new Map([[farImage,texture]]),errors:new Map()};
      const mask=engine.composeExploreScreen({viewport:{width:168,height:168,indices:new Uint8Array(168*168).fill(255)}});
      const pose={px:8,py:8,facing:0,eclBlockId:34};
      const replay=module.cokWallRestyleLayers(map,pose,fixtureWalls,fixtureLoaded,mask);
      const viewport=engine.renderFirstPersonViewWithSky(map,pose,fixtureWalls,{area:{indoor:0,outdoor:0},roofByte:0});
      const baseScreen=engine.composeExploreScreen({viewport});
      const good=engine.composeRgbaArt(baseScreen,engine.makeEgaPalette(),replay.layers,8);
      const badOrder=engine.composeRgbaArt(baseScreen,engine.makeEgaPalette(),replay.layers.filter(layer=>layer.pixelScale===8),8);
      const hadFar=new Uint8Array(320*200),owner=new Uint8Array(320*200),nativeRGB=new Map();
      for(const blit of engine.composeWallView(map,pose,fixtureWalls.readId)){
        const image=fixtureWalls.lookupTile(blit);if(!image)continue;
        for(let y=0;y<8;y++)for(let x=0;x<8;x++){
          const sx=blit.px+x,sy=blit.py+y,index=image.indices[y*8+x];
          if(sx<8||sx>=128||sy<8||sy>=128||index===13)continue;
          const key=sy*320+sx;if(image===farImage){hadFar[key]=1;owner[key]=1;}else{
            owner[key]=0;const color=(image.palette??engine.makeEgaPalette()).colors[index];nativeRGB.set(key,[color.r,color.g,color.b]);
          }
        }
      }
      let overlap=0,mutationFailures=0;
      for(const[key,rgb]of nativeRGB){if(!hadFar[key]||owner[key])continue;
        const x=key%320,y=Math.floor(key/320),offset=((y*8+4)*good.width+x*8+4)*4;
        if(rgb.some((v,c)=>good.pixels[offset+c]!==v))throw new Error('native near wall failed to occlude far restyle');
        if(rgb.some((v,c)=>badOrder.pixels[offset+c]!==v))mutationFailures++;overlap++;
      }
      if(!overlap||!mutationFailures)throw new Error(`occlusion mutation control was not discriminating: overlap=${overlap} failures=${mutationFailures} layers=${replay.layers.length}`);
      // Both admitted banks can overlap too; the same ordered blits must select the near32 art.
      const nearImage=walls.tileSets[2].tiles[nearIndex],nearArt=loaded.art.get(nearImage);
      const green={...nearArt,pixels:new Uint8ClampedArray(nearArt.pixels)};
      for(let i=0;i<green.pixels.length;i+=4){green.pixels[i]=23;green.pixels[i+1]=211;green.pixels[i+2]=67;}
      const mixed=module.cokWallRestyleLayers(map,pose,fixtureWalls,{art:new Map([[farImage,texture],[nearImage,green]]),errors:new Map()},mask);
      const mixedScreen=engine.composeRgbaArt(baseScreen,engine.makeEgaPalette(),mixed.layers,8);
      if(!mixed.tileIdentities.some(ref=>ref.blockId===31)||!mixed.tileIdentities.some(ref=>ref.blockId===32))throw new Error('mixed-bank fixture must expose both final owners');
      for(const[key]of nativeRGB){if(!hadFar[key]||owner[key])continue;
        const x=key%320,y=Math.floor(key/320),offset=((y*8+4)*mixedScreen.width+x*8+4)*4;
        if([23,211,67].some((value,c)=>mixedScreen.pixels[offset+c]!==value))throw new Error('near32 Restyle must occlude far31 Restyle');
      }
      return {tiles:loaded.art.size,maskedPixels:maskedCells,origin4:walls.tileOrigin(image4).blockId,tiles23:loaded23.art.size,maskedPixels23:masked23,origin23:walls23.tileOrigin([...loaded23.art.keys()][0]).blockId};
    },manifest);
    assert.deepEqual(controls,{tiles:140,maskedPixels:(930+2236)*64,origin4:31,tiles23:70,maskedPixels23:655*64,origin23:23});
    corrupt=true;
    const failures=await page.evaluate(async()=>{
      const engine=await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts'),module=await import('/src/ui/cokWallRestyle.ts');
      const get=async(name)=>new Uint8Array(await(await fetch(`/@fs/C:/Modding/GoldBox/Champions%20of%20Krynn/${name}`)).arrayBuffer());
      const bytes=await get('8X8D1.DAX'),blocks=new Map(engine.readDaxDataBlocks(bytes).map(block=>[block.blockId,block.raw]));
      await module.registerCokWallArchive(bytes,blocks,'8X8D1.DAX');
      const wd=new Map(engine.readDaxDataBlocks(await get('WALLDEF1.DAX')).map(block=>[block.blockId,block.raw]));
      const walls=engine.loadDungeonWalls([3,255,255],{walldefBlock:id=>wd.get(id)??null,tileBlock:id=>blocks.get(id)??null});
      const loaded=await module.loadCokWallRestyles(walls),keys=[...loaded.errors.keys()];
      return {mapped:loaded.art.size,errors:keys.length,bank31:keys.filter(key=>key.includes('#31:')).length,bank32:keys.filter(key=>key.includes('#32:')).length,
        fullIdentity:keys.every(key=>/^8X8D1\.DAX@[0-9a-f]{64}#(?:31|32):\d+$/.test(key))};
    });
    corrupt=false;
    assert.deepEqual(failures,{mapped:0,errors:140,bank31:70,bank32:70,fullIdentity:true},'error diagnostics must preserve both banks even when local IDs overlap');
  }
  assert.deepEqual(errors,[]);
    console.log(`PASS CoK wall source/route:210 identities/177 unique package pins;four actual directions,slot7/slot15 doors,viewport-only changes and exact DOS/state restoration. ${external?'Dev module/race/mutation controls skipped on external URL.':'Dev controls passed source-index13 alpha(3166+655 cells),tile4(7,1),wrong identities/source pixels,bank23 admission,near/far occlusion mutation and210-output stale remount.'}`);
} finally { await browser?.close(); server?.kill(); }
