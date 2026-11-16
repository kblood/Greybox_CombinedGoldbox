// Bounded PIC1#15 route: real retail opening/travel, followed by ordinary GEO1#32 movement.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, relative, sep, extname, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { bundleCokDialogueRestyle } from '../scripts/bundle-cok-dialogue-restyle.mjs';
const art = readFileSync('C:/GoldBoxImg/batch03_work/dist-app-cok-pic1-58-dialogue-candidate-20261026/restyle/out/004_face_cok_dos_pic1_015_f0.png');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(art), 'fafe65676a2fdeb3ad94727f07ab4ca836fce495064c9ca2e8cb60a54b96ed82');
for (const [path, expected] of [
    ['C:/GoldBoxImg/batch03/native/004_face_cok_dos_pic1_015_f0.png', 'f0e0d4a4e2eae51fed55c8f36ccbba30503898bb7beaab115ddd7eb245e33286'],
    ['C:/GoldBoxImg/batch03/004_face_cok_dos_pic1_015_f0_prompt.txt', 'c8e68fcfcb31e7c850c4f76e640a1622fdc9e59cd45a72dc4861987a04956da2'],
    ['C:/GoldBoxImg/batch03/004_face_cok_dos_pic1_015_f0_input.png', '2ce472f099f66acb41dd67df02950796b69fcba5989b1026e97657d2f5977a5a'],
    ['Champions of Krynn/PIC1.DAX', '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97'],
    ['Champions of Krynn/ECL1.DAX', '6387021ed8c84f2834d32d7c5e66dd03b88322d0c5072cba6cfb64a48e9ccf79'],
    ['Champions of Krynn/GEO1.DAX', 'e3670f73462c68dc15a438229aba82daf62f55e8e029a87e9da47ec4769165ae']
])
    assert.equal(hash(readFileSync(path)), expected, `Source/provenance changed: ${path}`);
const source = { game: 'cok', system: 'DOS-EGA', archive: 'PIC1.DAX', archiveSha256: '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97', blockId: 15, frameIndex: 0 };
const temporary = mkdtempSync(join(tmpdir(), 'greybox-cok-portrait15-'));
let assetFailure = null, delay = false, delayed = null, requests = 0;
const WEB = fileURLToPath(new URL('../', import.meta.url));
const STATIC_DIST = process.env.GB_COK_PORTRAIT15_DIST_DIR;
const EXTERNAL_BASE = process.env.GB_COK_PORTRAIT15_BASE_URL?.replace(/\/$/, '');
const probe = net.createServer();
let port, base;
if (EXTERNAL_BASE) base = EXTERNAL_BASE;
else {
    await new Promise(r => probe.listen(0, '127.0.0.1', r));
    port = probe.address().port;
    await new Promise(r => probe.close(r));
    base = `http://127.0.0.1:${port}`;
}
let server, staticServer;
let log = '';
if (EXTERNAL_BASE) {
    // The live server is externally owned; this harness only reads the published route.
} else if (STATIC_DIST) {
    const root = normalize(resolve(STATIC_DIST));
    staticServer = createServer((req, res) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = normalize(resolve(root, rel));
        if (file !== root && !file.startsWith(`${root}${sep}`)) { res.writeHead(403).end('Forbidden'); return; }
        const target = existsSync(file) && statSync(file).isFile() ? file : !extname(rel) ? resolve(root, 'index.html') : null;
        if (!target || !existsSync(target)) { res.writeHead(404).end('Not found'); return; }
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
        res.setHeader('Content-Type', types[extname(target).toLowerCase()] || 'application/octet-stream');
        createReadStream(target).pipe(res);
    });
    await new Promise((r, j) => { staticServer.once('error', j); staticServer.listen(port, '127.0.0.1', r); });
} else {
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: WEB, stdio: 'pipe' });
    server.stdout.on('data', b => log += b);
    server.stderr.on('data', b => log += b);
}
let browser;
const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function resolveNaturalCombat(page) {
    const before = await page.evaluate('({phase:window.__combat.phase(),roster:window.__combat.combatants(),gates:[window.__explore.areaMemory(0x4c3a),window.__explore.areaMemory(0x4c4b)]})');
    const played = await page.evaluate(() => { let actions = 0; while (!window.__combat.isOver() && actions < 2000) {
        if (!window.__combat.autoStep())
            break;
        actions++;
    } return { actions, over: window.__combat.isOver(), outcome: window.__combat.outcome(), log: window.__combat.log(), roster: window.__combat.combatants() }; });
    console.log('REAL_COMBAT', JSON.stringify({ before, actions: played.actions, over: played.over, outcome: played.outcome, logTail: played.log.slice(-3), after: played.roster }));
    assert.equal(played.over, true, 'Real AI gameplay must finish within bounded action budget');
    assert.ok(['party', 'draw'].includes(played.outcome), 'Do not continue after defeat');
    assert.ok(played.actions > 0);
    await page.evaluate(() => { window.__combat.declineContinueBattle(); window.__combat.acknowledgeVictory(); if (window.__combat.phase() === 'treasure') {
        window.__combat.exitTreasure();
        if (window.__combat.treasureExitPending())
            window.__combat.declineRemainingTreasure();
    } window.__combat.dismiss(); });
    await page.waitForFunction('!window.__explore.combatOpen() && !window.__explore.combatLaunchPending() && window.__explore.campaignRemountPending() === 0');
    await frame(page);
}
async function openRoute(page) {
    await page.goto(`${base}/?create=1`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    for (let i = 0; i < 6; i++) {
        await page.$eval('.cc-input', (input, name) => { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); }, `Route Keeper ${i + 1}`);
        for (let roll = 0; roll < 100; roll++) {
            await page.click('.cc-roll');
            if (await page.$eval('.cc-add', b => !b.disabled))
                break;
        }
        assert.equal(await page.$eval('.cc-add', b => b.disabled), false, 'Ordinary 4d6 roll must produce a valid creator draft');
        await page.click('.cc-add');
    }
    const created = await page.evaluate(() => JSON.parse(localStorage.getItem('greybox.party.cok')));
    assert.equal(created.length, 6);
    assert.ok(created.every(c => c.classes.fighter === 1));
    console.log('ORDINARY_CREATED_PARTY', JSON.stringify(created));
    await page.goto(`${base}/?explore=cok`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.__dialogue || window.__rendered === 0', { timeout: 45000 });
    let used = false;
    for (let i = 0; i < 80; i++) {
        if (await page.evaluate('!!window.__cokTravel?.open?.()'))
            break;
        if (await page.evaluate('!!window.__cokOpeningCamp?.open?.()')) {
            await page.evaluate('window.__cokOpeningCamp.exit()');
            continue;
        }
        const turn = await page.evaluate('window.__dialogue ? {kind:window.__dialogue.kind(),choices:window.__dialogue.choices(),picture:window.__dialogue.pictureId()} : null');
        assert.notEqual(turn?.kind, 'combat', 'No unrelated opening combat may be bypassed');
        if (turn?.kind === 'say') {
            const leave = turn.choices.findIndex(x => /^LEAVE$/i.test(x)), commandant = turn.choices.findIndex(x => /^COMMANDANT$/i.test(x));
            const picked = leave >= 0 && commandant >= 0 && !used ? commandant : leave >= 0 ? leave : 0;
            if (picked === commandant && commandant >= 0)
                used = true;
            await page.evaluate(c => window.__dialogue.choose(c), picked);
        }
        else if (turn?.kind === 'end')
            await page.evaluate('window.__dialogue.close()');
        await frame(page);
    }
    await page.waitForFunction('window.__cokTravel?.open?.()', { timeout: 20000 });
    const opening = await page.evaluate('({visited:window.__cokOpening.visited(),complete:window.__cokOpening.complete()})');
    assert.equal(opening.complete, true);
    assert.deepEqual(opening.visited, [36, 16, 17, 16]);
    await page.evaluate('window.__cokTravel.choose(1)');
    for (let i = 0; i < 16; i++) {
        if (await page.evaluate('window.__explore?.currentArea?.()?.areaId === 32 && window.__explore.campaignRemountPending() === 0'))
            break;
        const t = await page.evaluate('window.__dialogue ? {kind:window.__dialogue.kind(),choices:window.__dialogue.choices()} : null');
        if (t?.kind === 'say') {
            const yes = t.choices.findIndex(x => /^YES$/i.test(x));
            await page.evaluate(c => window.__dialogue.choose(c), yes >= 0 ? yes : 0);
        }
        else if (t?.kind === 'end')
            await page.evaluate('window.__dialogue.close()');
        await frame(page);
    }
    await page.waitForFunction('window.__explore?.currentArea?.()?.areaId === 32 && window.__explore.campaignRemountPending() === 0', { timeout: 45000 });
    const snap = () => page.evaluate('({area:window.__explore.currentArea(),pose:window.__explore.getPose(),gates:[window.__explore.areaMemory(0x4c3a),window.__explore.areaMemory(0x4c4b)],blocked:window.__explore.blocked(),launchPending:window.__explore.combatLaunchPending(),lastEvent:window.__explore.lastEvent(),dialogue:window.__dialogue?{id:window.__dialogue.pictureId(),text:window.__dialogue.text(),choices:window.__dialogue.choices(),kind:window.__dialogue.kind()}:null,combat:window.__explore.combatOpen()})');
    const landed = await snap();
    console.log('LANDED', JSON.stringify(landed));
    assert.deepEqual(landed.pose, { x: 2, y: 1, facing: 'north' });
    assert.equal(landed.gates[0], 0);
    assert.equal(landed.gates[1] & 2, 0);
    const moves = [];
    for (const action of ['forward', 'left', 'forward', 'forward', 'left', 'forward', 'forward', 'forward', 'left', 'forward']) {
        if (await page.evaluate('window.__explore.combatOpen()'))
            await resolveNaturalCombat(page);
        assert.equal(await page.evaluate('window.__explore.combatOpen() || !!window.__dialogue'), false, 'Unexpected overlay before legal move');
        await page.evaluate(a => window.__explore.move(a), action);
        await page.waitForFunction('window.__explore.campaignRemountPending() === 0 && (!window.__explore.combatLaunchPending() || window.__explore.combatOpen() || !!window.__dialogue)');
        await frame(page);
        const result = await snap();
        assert.deepEqual(result.area, { disk: 1, areaId: 32 });
        moves.push({ action, ...result });
        console.log('MOVE', action, JSON.stringify(result));
    }
    const result = await snap();
    assert.deepEqual(result.area, { disk: 1, areaId: 32 });
    assert.deepEqual(result.pose, { x: 1, y: 3, facing: 'east' });
    assert.equal(result.dialogue?.id, 15);
    assert.equal(result.combat, false);
    assert.equal(result.gates[1] & 2, 2);
    return { opening, landed, moves, result };
}
async function snapshot(page, save = false) {
    return page.evaluate(async (save) => {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = document.querySelector('.gb-dlg-panel-native canvas'), ctx = canvas.getContext('2d');
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, rect = window.__dialogue.displayRect(), dpr = devicePixelRatio || 1;
        const left = Math.floor((rect.x + 24 * rect.width / 320) * dpr), top = Math.floor((rect.y + 24 * rect.height / 200) * dpr), right = Math.ceil((rect.x + 112 * rect.width / 320) * dpr), bottom = Math.ceil((rect.y + 112 * rect.height / 200) * dpr);
        const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        if (save)
            window.before15 = { pixels, left, top, right, bottom };
        return { screen: await digest(pixels), portrait: await digest(ctx.getImageData(left, top, right - left, bottom - top).data), state: { id: window.__dialogue.pictureId(), source: window.__dialogue.pictureSource(), kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices(), pose: window.__explore.getPose(), area: window.__explore.currentArea(), memory: Array.from({ length: 1024 }, (_, i) => window.__explore.areaMemory(0x4b00 + i)), clock: window.__explore.clockMinutes(), persistent: Object.fromEntries(Object.entries(localStorage).filter(([k]) => !k.startsWith('greybox.graphics'))) } };
    }, save);
}
async function setMode(page, mode) { await page.evaluate(mode => { localStorage.setItem('greybox.graphics.cok', mode); window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'cok', mode } })); }, mode); }
async function waitArt(page) { await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle (reviewed picture only)")'); }
async function controls(page) {
    await page.evaluate(async () => {
        const engine = await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts'), dialogue = await import('/src/ui/dialogue.ts'), portrait = await import('/src/ui/cokPortraitArt.ts'), catalog = await import('/src/ui/catalog.ts');
        const bytes = new Uint8Array(await (await fetch(catalog.assetUrl('Champions of Krynn/PIC1.DAX'))).arrayBuffer());
        const pictures = new Map(engine.decodeDax(bytes, 'PIC1.DAX').blocks.filter(b => b.image).map(b => [b.blockId, b.image]));
        window.openControl15 = (identity, id = 15) => { const runner = new engine.DialogueRunner({ run: () => ({ status: 'exited', effects: [] }), resume: () => ({ status: 'exited', effects: [] }) }); dialogue.openDialogueAt(runner, { kind: 'end', text: 'Isolated source/lifecycle control', pictureId: id }, { presentation: { pictures, pictureSources: identity ? new Map([[id, identity]]) : new Map(), sceneArts: portrait.cokPortraitSceneArts() } }); };
    });
    const beforeRequests = requests;
    for (const wrong of [null, { ...source, game: 'dok' }, { ...source, system: 'Amiga' }, { ...source, archive: 'PIC2.DAX' }, { ...source, archiveSha256: '0'.repeat(64) }, { ...source, blockId: 57 }, { ...source, frameIndex: 1 }]) {
        await setMode(page, 'Restyle');
        await page.evaluate(s => window.openControl15(s), wrong);
        const rejected = await snapshot(page);
        await setMode(page, 'DOS-EGA');
        assert.deepEqual(await snapshot(page), rejected, 'Wrong source identity must retain native pixels/state');
    }
    await setMode(page, 'Restyle');
    await page.evaluate(s => window.openControl15(s, 18), { ...source, blockId: 18 });
    const unadmitted = await snapshot(page);
    await setMode(page, 'DOS-EGA');
    assert.deepEqual(await snapshot(page), unadmitted);
    assert.equal(requests, beforeRequests, 'Wrong/unadmitted identities may not request art');
    for (const failure of ['missing', 'hash', 'geometry', 'type', 'corrupt']) {
        assetFailure = failure;
        await setMode(page, 'DOS-EGA');
        await page.evaluate(s => window.openControl15(s), source);
        const native = await snapshot(page);
        await setMode(page, 'Restyle');
        await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle unavailable")');
        assert.deepEqual(await snapshot(page), native, `${failure} must fall back exactly`);
        assetFailure = null;
        await page.click('[data-art-mode=restyle]');
        await waitArt(page);
    }
    for (const action of ['mode', 'picture', 'close-reopen', 'source-replacement']) {
        await setMode(page, 'DOS-EGA');
        await page.evaluate(s => window.openControl15(s), source);
        delay = true;
        delayed = null;
        await setMode(page, 'Restyle');
        for (let i = 0; i < 100 && !delayed; i++)
            await new Promise(r => setTimeout(r, 25));
        assert.ok(delayed, 'Expected a fresh delayed15 request');
        if (action === 'mode')
            await setMode(page, 'DOS-EGA');
        else if (action === 'picture') {
            await setMode(page, 'DOS-EGA');
            await page.evaluate(s => window.openControl15(s, 57), { ...source, blockId: 57 });
        }
        else if (action === 'close-reopen') {
            await page.evaluate('window.__dialogue.close()');
            await setMode(page, 'DOS-EGA');
            await page.evaluate(s => window.openControl15(s), source);
        }
        else
            await page.evaluate(s => window.openControl15(s), { ...source, archiveSha256: '0'.repeat(64) });
        const before = await snapshot(page);
        delay = false;
        await delayed();
        await page.waitForNetworkIdle();
        assert.deepEqual(await snapshot(page), before, `Late15 completion must not overwrite ${action}`);
        assert.equal(await page.evaluate('window.artBitmapsOpen'), 0);
    }
}
try {
    const packaged = join(temporary, 'package');
    mkdirSync(packaged);
    bundleCokDialogueRestyle(undefined, packaged);
    assert.deepEqual(readdirSync(join(packaged, 'restyle/cok/dialogue')).sort(), ['PIC1_015_f0_restyle.png', 'PIC1_057_f0_restyle.png', 'PIC1_058_f0_restyle.png']);
    assert.equal(hash(readFileSync(join(packaged, 'restyle/cok/dialogue/PIC1_015_f0_restyle.png'))), hash(art));
    const bad = join(temporary, 'bad15.png'), bytes = Buffer.from(art);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(bad, bytes);
    const rejected = join(temporary, 'rejected');
    mkdirSync(rejected);
    assert.throws(() => bundleCokDialogueRestyle(undefined, rejected, undefined, undefined, bad), /SHA-256 differs/);
    assert.deepEqual(readdirSync(rejected), []);
    for (let i = 0; i < 120; i++) {
        try {
            if ((await fetch(base)).ok)
                break;
        }
        catch { }
        await new Promise(r => setTimeout(r, 100));
    }
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => { if (!request.url().includes('/restyle/cok/dialogue/PIC1_015_f0_restyle.png')) {
        void request.continue();
        return;
    } requests++; const bytes = Buffer.from(art); if (assetFailure === 'hash')
        bytes[bytes.length - 1] ^= 1; if (assetFailure === 'geometry')
        bytes.writeUInt32BE(1, 16); if (assetFailure === 'type')
        bytes[25] = 6; if (assetFailure === 'corrupt')
        bytes[0] = 0; const respond = () => request.respond(assetFailure === 'missing' ? { status: 404, body: 'missing' } : { status: 200, contentType: 'image/png', body: bytes }); if (delay)
        delayed = respond;
    else
        void respond(); });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('greybox.graphics.cok', 'DOS-EGA'); window.artBitmapsOpen = 0; const original = window.createImageBitmap; window.createImageBitmap = async (...args) => { const bitmap = await original(...args); window.artBitmapsOpen++; const close = bitmap.close.bind(bitmap); bitmap.close = () => { window.artBitmapsOpen--; close(); }; return bitmap; }; });
    const route = await openRoute(page);
    const original = await snapshot(page, true);
    assert.deepEqual(original.state.source, source);
    await setMode(page, 'Restyle');
    await waitArt(page);
    const restyle = await snapshot(page);
    assert.notEqual(restyle.portrait, original.portrait);
    assert.deepEqual(restyle.state, original.state, 'Switching graphics cannot change ECL/party/pose/time');
    const changed = await page.evaluate(() => { const b = window.before15, c = document.querySelector('.gb-dlg-panel-native canvas'), p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let inside = 0, outside = 0; for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (p.slice(i, i + 4).some((v, j) => v !== b.pixels[i + j])) {
                if (x >= b.left && x < b.right && y >= b.top && y < b.bottom)
                    inside++;
                else
                    outside++;
            }
        } return { inside, outside }; });
    assert.ok(changed.inside > 0);
    assert.equal(changed.outside, 0);
    await setMode(page, 'Amiga');
    assert.deepEqual(await snapshot(page), original, 'Unadmitted Amiga must use exact DOS fallback');
    await setMode(page, 'DOS-EGA');
    assert.deepEqual(await snapshot(page), original, 'DOS must restore exact pixels and all game state');
    assert.equal(await page.evaluate('window.artBitmapsOpen'), 0);
    if (STATIC_DIST || EXTERNAL_BASE) {
        console.log(`PASS PIC1#15 ${EXTERNAL_BASE ? 'live' : 'candidate'}: ordinary creator/opening/travel/step route, exact source, portrait-only change`, JSON.stringify({ pose: route.result.pose, gates: route.result.gates, changed }), 'DOS/Restyle/Amiga/DOS invariance. Vite-only isolated controls skipped.');
    } else {
        await controls(page);
        console.log('PASS PIC1#15: ordinary creator/opening/travel/step route, exact source, portrait-only change', JSON.stringify({ pose: route.result.pose, gates: route.result.gates, changed }), 'DOS/Restyle/Amiga/DOS invariance, source/PNG negatives, stale picture/mode/close/reopen/source replacement, cleanup and isolated packaging');
    }
}
finally {
    await browser?.close();
    if (server) { server.kill(); await new Promise(r => server.once('exit', r)); }
    if (staticServer) await new Promise(r => staticServer.close(r));
    const rel = relative(tmpdir(), temporary);
    assert.ok(rel.startsWith('greybox-cok-portrait15-') && !rel.includes(sep));
    rmSync(temporary, { recursive: true });
}
