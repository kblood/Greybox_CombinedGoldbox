// End-to-end browser smoke test for the Greybox map editor (M5.S3, G4).
//
// Boots the Vite dev server, drives headless Edge via puppeteer-core, and walks the literal
// BUILD-QUEUE acceptance for this slice: place tiles/walls, save, reload, playtest. No real game
// data is needed (the editor only deals in plain author-chosen numbers), so unlike apps/web's
// e2e this never "SKIP"s for a data-less clone.
//
//   npm run e2e

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = 5190; // distinct from apps/web's 5180
const BASE = `http://localhost:${PORT}`;
const REFERENCE_CAMPAIGN_PATH = resolve(
  process.cwd(), '..', '..', 'packages', 'engine', 'test', 'fixtures', 'the-greyfen-beacon.gbmod',
);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const IGNORE_CONSOLE = [/favicon/i, /\[vite\]/i, /DevTools/i];

async function waitForServer(proc) {
  let exited = false;
  proc.on('exit', (c) => { exited = true; proc._exitCode = c; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`vite exited early (${proc._exitCode})`);
    try {
      const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) });
      if (r.ok || r.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('vite did not answer on ' + BASE + ' within 30s');
}

function newPage(browser) {
  return browser.newPage().then((page) => {
    const errors = [];
    const bad = [];
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE_CONSOLE.some((re) => re.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(`${r.status()} ${decodeURIComponent(r.url())}`); });
    return { page, errors, bad };
  });
}

async function waitAuthor(page) {
  await page.waitForFunction('window.__author && typeof window.__author.newMap === "function"', { timeout: 20000 });
}

async function replaceControlValue(page, selector, value) {
  await page.locator(selector).fill(String(value));
}

/** Click the center of one rendered map cell through the real canvas pointer path. */
async function clickCanvasCell(page, x, y) {
  const layout = await page.evaluate(() => window.__author.layout());
  const rect = await page.evaluate(() => {
    const r = document.querySelector('#gb-canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const cx = layout.originX + layout.cellPx * x + layout.cellPx / 2;
  const cy = layout.originY + layout.cellPx * y + layout.cellPx / 2;
  await page.mouse.click(
    rect.left + (cx / 320) * rect.width,
    rect.top + (cy / 200) * rect.height,
  );
}

async function waitForFile(path, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  let stableReads = 0;
  while (Date.now() < deadline) {
    if (existsSync(path) && !existsSync(`${path}.crdownload`)) {
      const current = readFileSync(path);
      if (current.byteLength > 0 && previous?.equals(current)) {
        stableReads += 1;
        if (stableReads >= 2) return current;
      } else {
        stableReads = 0;
      }
      previous = current;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`download did not finish: ${path}`);
}

async function upsertVisibleJson(page, inputSelector, buttonSelector, value) {
  await replaceControlValue(page, inputSelector, JSON.stringify(value));
  await page.click(buttonSelector);
}

// Case A: seam-driven — place walls/floor/zone/entries, save, reload (full page reload), verify
// persistence, then playtest both entry points (one blocked by a painted wall, one open).
async function runEditSaveReloadPlaytest(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    await page.evaluate(() => window.__author.newMap(2, 1));
    // "place tiles/walls": close the east edge of (0,0), paint a floor+zone on (1,0).
    await page.evaluate(() => { window.__author.setTool('wall-east'); window.__author.setValue(3); window.__author.clickCell(0, 0); });
    await page.evaluate(() => { window.__author.setTool('floor'); window.__author.setValue(4); window.__author.clickCell(1, 0); });
    await page.evaluate(() => { window.__author.setTool('zone'); window.__author.setValue(1); window.__author.clickCell(1, 0); });
    // two entry points: id 0 faces the wall (blocked), id 1 faces the open edge (walkable).
    await page.evaluate(() => { window.__author.setTool('entry'); window.__author.setEntryId(0); window.__author.setEntryFacing('east'); window.__author.clickCell(0, 0); });
    await page.evaluate(() => { window.__author.setEntryId(1); window.__author.setEntryFacing('west'); window.__author.clickCell(1, 0); });

    const before = await page.evaluate(() => ({
      wall: window.__author.wallAt(0, 0, 'east'),
      floor: window.__author.floorAt(1, 0),
      zone: window.__author.zoneAt(1, 0),
      entries: window.__author.entries(),
    }));

    // "save" (M11.S2: named-module save — auto-restored on the next boot via the "last module" key)
    await page.evaluate(() => window.__author.saveModule());
    // "reload" — a real page reload, proving persistence through localStorage, not just in-memory state.
    await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    const after = await page.evaluate(() => ({
      wall: window.__author.wallAt(0, 0, 'east'),
      floor: window.__author.floorAt(1, 0),
      zone: window.__author.zoneAt(1, 0),
      entries: window.__author.entries(),
    }));

    const persisted = after.wall === 3 && after.floor === 4 && after.zone === 1 && after.entries.length === 2;

    // "playtest": entry 0 faces a painted wall -> blocked.
    await page.evaluate(() => { window.__author.setEntryId(0); window.__author.startPlaytest(); });
    const pose0 = await page.evaluate(() => window.__author.pose());
    const canEast = await page.evaluate(() => window.__author.canMove('east'));
    const step0 = await page.evaluate(() => window.__author.move('forward'));
    await page.evaluate(() => window.__author.stopPlaytest());

    // entry 1 faces the never-painted opposite edge -> walkable.
    await page.evaluate(() => { window.__author.setEntryId(1); window.__author.startPlaytest(); });
    const pose1 = await page.evaluate(() => window.__author.pose());
    const canWest = await page.evaluate(() => window.__author.canMove('west'));
    const step1 = await page.evaluate(() => window.__author.move('forward'));
    const poseAfterStep1 = await page.evaluate(() => window.__author.pose());
    await page.evaluate(() => window.__author.stopPlaytest());

    const blockedOk = !!pose0 && pose0.x === 0 && pose0.y === 0 && pose0.facing === 'east' && canEast === false && step0.moved === false;
    const openOk = !!pose1 && pose1.x === 1 && pose1.y === 0 && pose1.facing === 'west' && canWest === true && step1.moved === true &&
      !!poseAfterStep1 && poseAfterStep1.x === 0 && poseAfterStep1.y === 0;

    pass = JSON.stringify(before) === JSON.stringify(after) && persisted && blockedOk && openOk && errors.length === 0 && bad.length === 0;
    detail = `persisted=${persisted} blocked=${blockedOk} open=${openOk}`;
  } catch (e) {
    errors.push(`edit-save-reload-playtest: ${e.message}`);
  }
  await page.close();
  return { id: 'edit-save-reload-playtest', label: 'Place tiles/walls, save, reload, playtest (seam-driven)', detail, errors, bad, pass };
}

// Case B: a real mouse click on the canvas (the actual pointer-driven authoring path, not just
// the JS seam) paints a wall on the cell under the cursor.
async function runRealCanvasClick(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);
    await page.evaluate(() => { window.__author.newMap(4, 4); window.__author.setTool('wall-north'); window.__author.setValue(5); });

    const cellX = 1, cellY = 2;
    await clickCanvasCell(page, cellX, cellY);

    const wall = await page.evaluate((x, y) => window.__author.wallAt(x, y, 'north'), cellX, cellY);
    pass = wall === 5 && errors.length === 0 && bad.length === 0;
  } catch (e) {
    errors.push(`real-canvas-click: ${e.message}`);
  }
  await page.close();
  return { id: 'real-canvas-click', label: 'Real mouse click on the canvas paints a wall', errors, bad, pass };
}

// Case C (M5.S4): author an event chain — a text event that chains into a combat event that
// branches by outcome into a closing message — then playtest it: walk onto the linked cell, watch
// the chain fire and pause for a verdict, resolve combat, and confirm the branch taken matches.
async function runEventChainPlaytest(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    await page.evaluate(() => window.__author.newMap(2, 1));
    await page.evaluate(() => { window.__author.setTool('entry'); window.__author.setEntryId(0); window.__author.setEntryFacing('east'); window.__author.clickCell(0, 0); });

    // Base package validation now requires every combat reference to resolve through the authored
    // database, so this older chain fixture carries its deliberately simple monster explicitly.
    await page.evaluate((json) => window.__author.upsertDbJson('monsters', json), JSON.stringify({
      id: 12, name: 'CHAIN TEST GOBLIN', hitPoints: 7, armorClass: 6, thac0: 19,
      damage: { count: 1, sides: 6, bonus: 0 }, xp: 15,
    }));

    // Author the chain: message #1 --chain--> combat #2 --victory--> message #3.
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 1, type: 'message', body: { text: 'A GOBLIN BLOCKS THE PATH', chainTo: 2 },
    }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 2, type: 'combat', body: { monsters: [{ monsterId: 12, count: 1, picBlockId: 0 }], onVictory: 3, onDefeat: 4 },
    }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 3, type: 'message', body: { text: 'YOU WIN' },
    }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 4, type: 'message', body: { text: 'YOU DIED' },
    }));
    // Link the destination cell (1,0) to event #1.
    await page.evaluate(() => window.__author.setCellEventDirect(1, 0, 1));

    const eventsAuthored = await page.evaluate(() => window.__author.events().map((e) => e.id));

    // Playtest: walk onto (1,0) and the chain should fire automatically, pausing on combat.
    await page.evaluate(() => window.__author.startPlaytest());
    const step = await page.evaluate(() => window.__author.move('forward'));
    const logAfterCombatPause = await page.evaluate(() => window.__author.eventLog());
    const awaitingCombat = await page.evaluate(() => window.__author.awaitingKind());

    // Resolve the fight as a victory and confirm the chain follows through to event #3's text.
    await page.evaluate(() => window.__author.answerCombat('victory'));
    const logAfterVictory = await page.evaluate(() => window.__author.eventLog());
    const awaitingAfter = await page.evaluate(() => window.__author.awaitingKind());
    await page.evaluate(() => window.__author.stopPlaytest());

    const authoredOk = eventsAuthored.length === 4 && eventsAuthored.every((id) => [1, 2, 3, 4].includes(id));
    const movedOk = !!step && step.moved === true && step.event === 1;
    const pausedOk = awaitingCombat === 'combat' && logAfterCombatPause.includes('A GOBLIN BLOCKS THE PATH');
    const resolvedOk = awaitingAfter === null && logAfterVictory.includes('YOU WIN') && !logAfterVictory.includes('YOU DIED');

    pass = authoredOk && movedOk && pausedOk && resolvedOk && errors.length === 0 && bad.length === 0;
    detail = `authored=${authoredOk} moved=${movedOk} paused=${pausedOk} resolved=${resolvedOk}`;
  } catch (e) {
    errors.push(`event-chain-playtest: ${e.message}`);
  }
  await page.close();
  return { id: 'event-chain-playtest', label: 'Author an event chain, playtest fires it correctly', detail, errors, bad, pass };
}

// Case D (M5.S5): author a monster via the database seam, wire a combat event referencing its id,
// playtest, and confirm the combat pause displays the authored monster's real name (not a
// placeholder) — then register a custom ruleset with a distinctive THAC0 table, switch to it, and
// confirm the loaded ruleset + its math reflect the switch (not the addnd1e default).
async function runDatabaseAndRulesetPlaytest(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    await page.evaluate(() => window.__author.newMap(2, 1));
    await page.evaluate(() => { window.__author.setTool('entry'); window.__author.setEntryId(0); window.__author.setEntryFacing('east'); window.__author.clickCell(0, 0); });

    // Author a monster (id 42) via the database JSON seam.
    await page.evaluate((json) => window.__author.upsertDbJson('monsters', json), JSON.stringify({
      id: 42, name: 'AUTHORED WYVERN', hitPoints: 33, armorClass: 3, thac0: 13, damage: { count: 2, sides: 6, bonus: 1 }, xp: 275,
    }));
    const dbAfterUpsert = await page.evaluate(() => window.__author.db());

    // Wire a combat event referencing monster #42, chained from a linked cell.
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 1, type: 'combat', body: { monsters: [{ monsterId: 42, count: 1, picBlockId: 0 }], onVictory: 2, onDefeat: 3 },
    }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({ id: 2, type: 'message', body: { text: 'WYVERN SLAIN' } }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({ id: 3, type: 'message', body: { text: 'PARTY WIPED' } }));
    await page.evaluate(() => window.__author.setCellEventDirect(1, 0, 1));

    // Playtest: walk onto the linked cell, combat should pause showing the authored monster's name.
    await page.evaluate(() => window.__author.startPlaytest());
    await page.evaluate(() => window.__author.move('forward'));
    const monstersShown = await page.evaluate(() => window.__author.combatMonsters());
    const awaitingCombat = await page.evaluate(() => window.__author.awaitingKind());
    await page.evaluate(() => window.__author.answerCombat('victory'));
    const logAfter = await page.evaluate(() => window.__author.eventLog());
    await page.evaluate(() => window.__author.stopPlaytest());

    const dbOk = dbAfterUpsert.monsters.some((m) => m.id === 42 && m.name === 'AUTHORED WYVERN');
    const monstersOk = awaitingCombat === 'combat' && monstersShown.length === 1 && monstersShown[0].name === 'AUTHORED WYVERN' && monstersShown[0].count === 1;
    const resolvedOk = logAfter.includes('WYVERN SLAIN');

    // Ruleset switch: register a custom ruleset with a distinctive fighter THAC0 at level 1 (2 —
    // no real ruleset uses that), switch to it, and confirm the SAME package now resolves through it.
    const rulesetIdsBefore = await page.evaluate(() => window.__author.rulesetIds());
    await page.evaluate((json) => window.__author.registerCustomRulesetJson(json), JSON.stringify({
      id: 'grim-1e', name: 'Grim 1e', classes: { fighter: { xp: [0, 1000], perLevel: 1000, hitDie: 12, thac0: [2, 1] } },
    }));
    const rulesetIdsAfter = await page.evaluate(() => window.__author.rulesetIds());

    await page.evaluate(() => window.__author.startPlaytest());
    const loadedCustom = await page.evaluate(() => window.__author.loadedRulesetId());
    const thac0Custom = await page.evaluate(() => window.__author.thac0For('fighter', 1));
    await page.evaluate(() => window.__author.stopPlaytest());

    await page.evaluate(() => window.__author.setRuleset('addnd1e-dragonlance'));
    await page.evaluate(() => window.__author.startPlaytest());
    const loadedDefault = await page.evaluate(() => window.__author.loadedRulesetId());
    const thac0Default = await page.evaluate(() => window.__author.thac0For('fighter', 1));
    await page.evaluate(() => window.__author.stopPlaytest());

    const registeredOk = !rulesetIdsBefore.includes('grim-1e') && rulesetIdsAfter.includes('grim-1e');
    const switchedOk = loadedCustom === 'grim-1e' && thac0Custom === 2 && loadedDefault === 'addnd1e-dragonlance' && thac0Default !== 2;

    pass = dbOk && monstersOk && resolvedOk && registeredOk && switchedOk && errors.length === 0 && bad.length === 0;
    detail = `db=${dbOk} monsters=${monstersOk} resolved=${resolvedOk} registered=${registeredOk} switched=${switchedOk}`;
  } catch (e) {
    errors.push(`database-and-ruleset-playtest: ${e.message}`);
  }
  await page.close();
  return { id: 'database-and-ruleset-playtest', label: 'Author a monster + wire combat; register + switch a custom ruleset', detail, errors, bad, pass };
}

// Case E (M11.S2): named modules replace the old single anonymous slot. Author "Dungeon One"
// (map + event + a DB monster), save it under that name, Export (captured via the seam rather than
// a real browser download — same convention as the JSON-textarea seams above), "New" to clear the
// editor, Import the exported content back in, and playtest it — it must play identically to the
// original authoring. Then author + save a second named module and confirm the first survives
// untouched (the acceptance's "doesn't clobber" check).
async function runNamedModuleExportImport(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    await page.evaluate(() => window.__author.newMap(2, 1));
    await page.evaluate(() => { window.__author.setTool('entry'); window.__author.setEntryId(0); window.__author.setEntryFacing('east'); window.__author.clickCell(0, 0); });
    await page.evaluate((json) => window.__author.upsertDbJson('monsters', json), JSON.stringify({
      id: 7, name: 'EXPORT TEST GOBLIN', hitPoints: 7, armorClass: 6, thac0: 19, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15,
    }));
    await page.evaluate((json) => window.__author.upsertEventJson(json), JSON.stringify({
      id: 1, type: 'message', body: { text: 'DUNGEON ONE EVENT' },
    }));
    await page.evaluate(() => window.__author.setCellEventDirect(1, 0, 1));
    await page.evaluate(() => window.__author.setModuleName('Dungeon One'));
    await page.evaluate(() => window.__author.saveModule());

    const exported = await page.evaluate(() => window.__author.exportModule());

    // "New" clears the editor back to a blank, unnamed map.
    await page.evaluate(() => window.__author.newMap(5, 5));
    const clearedName = await page.evaluate(() => window.__author.moduleName());
    const clearedEvents = await page.evaluate(() => window.__author.events());

    // Import the exported file's content back in.
    await page.evaluate((content) => window.__author.importModuleJson(content), exported.content);
    const restoredDims = await page.evaluate(() => window.__author.dims());
    const restoredName = await page.evaluate(() => window.__author.moduleName());
    const restoredEvents = await page.evaluate(() => window.__author.events());
    const restoredDb = await page.evaluate(() => window.__author.db());

    // Playtest the imported module — should play identically to the original authoring.
    await page.evaluate(() => { window.__author.setEntryId(0); window.__author.startPlaytest(); });
    const step = await page.evaluate(() => window.__author.move('forward'));
    const logAfter = await page.evaluate(() => window.__author.eventLog());
    await page.evaluate(() => window.__author.stopPlaytest());

    const exportedOk = exported.filename === 'dungeon-one.gbmod' && exported.content.includes('DUNGEON ONE EVENT');
    const clearedOk = clearedName === 'Untitled' && clearedEvents.length === 0;
    const restoredOk = restoredDims.width === 2 && restoredDims.height === 1 && restoredName === 'Dungeon One' &&
      restoredEvents.length === 1 && restoredDb.monsters.some((m) => m.id === 7 && m.name === 'EXPORT TEST GOBLIN');
    const playedOk = !!step && step.moved === true && step.event === 1 && logAfter.includes('DUNGEON ONE EVENT');

    // A second named module can be created and saved without clobbering the first.
    await page.evaluate(() => window.__author.newMap(3, 3));
    await page.evaluate(() => window.__author.setModuleName('Dungeon Two'));
    await page.evaluate(() => window.__author.saveModule());
    const modules = await page.evaluate(() => window.__author.modules());

    await page.evaluate(() => window.__author.loadModuleByName('Dungeon One'));
    const dungeonOneAfterSecondSave = await page.evaluate(() => ({ dims: window.__author.dims(), events: window.__author.events() }));

    const bothListedOk = modules.includes('Dungeon One') && modules.includes('Dungeon Two');
    const notClobberedOk = dungeonOneAfterSecondSave.dims.width === 2 && dungeonOneAfterSecondSave.dims.height === 1 &&
      dungeonOneAfterSecondSave.events.length === 1;

    pass = exportedOk && clearedOk && restoredOk && playedOk && bothListedOk && notClobberedOk && errors.length === 0 && bad.length === 0;
    detail = `exported=${exportedOk} cleared=${clearedOk} restored=${restoredOk} played=${playedOk} listed=${bothListedOk} notClobbered=${notClobberedOk}`;
  } catch (e) {
    errors.push(`named-module-export-import: ${e.message}`);
  }
  await page.close();
  return { id: 'named-module-export-import', label: "Named modules: save/Export/New/Import plays identically; 2nd module doesn't clobber 1st", detail, errors, bad, pass };
}

// Item 20 safety plumbing: build an invalid one-map draft through literal controls, prove visible
// validation blocks both the real Export and Playtest buttons (and the export seam), repair it,
// prove strict complete-campaign checks are optional, then reject a real multi-map file selection
// without replacing the current editor state. This is deliberately not the final golden campaign.
async function runVisibleValidationControls(browser) {
  const { page, errors, bad } = await newPage(browser);
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'greybox-author-validation-'));
  const multiMapPath = resolve(tempRoot, 'two-maps.gbmod');
  let pass = false;
  let detail = '';
  try {
    const emptyMap = (name) => ({
      name, width: 1, height: 1,
      cells: [{ walls: { north: 0, east: 0, south: 0, west: 0 } }],
      entries: [{ id: 0, x: 0, y: 0, facing: 'north' }],
      events: [],
    });
    writeFileSync(multiMapPath, JSON.stringify({
      schema: 1,
      id: 'two-map-rejection',
      title: 'Two Map Rejection',
      ruleset: 'addnd1e',
      maps: [emptyMap('First Map'), emptyMap('Second Map')],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
      databases: { monsters: [], items: [], spells: [], classes: [], races: [] },
    }), 'utf8');

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    // Use the released controls, including the new public map-name input and a real canvas click.
    await replaceControlValue(page, '#new-w', 2);
    await replaceControlValue(page, '#new-h', 1);
    await page.click('#btn-new');
    await replaceControlValue(page, '#module-name', 'Visible Validation Draft');
    await replaceControlValue(page, '#map-name', 'Visible Validation Map');
    await page.click('[data-tool="event"]');
    await replaceControlValue(page, '#tool-value', 99);
    await clickCanvasCell(page, 1, 0);

    await page.click('#btn-validate');
    const invalidBase = await page.evaluate(() => ({
      status: document.querySelector('#validation-summary').dataset.status,
      errors: Number(document.querySelector('#validation-summary').dataset.errors),
      codes: [...document.querySelectorAll('#validation-findings li')].map((li) => li.dataset.code),
    }));

    await page.click('#btn-export');
    const seamExport = await page.evaluate(() => window.__author.exportModule());
    const exportStatus = await page.$eval('#status', (el) => el.textContent);

    await page.click('#btn-playtest');
    const playtestBlocked = await page.evaluate(() => ({
      button: document.querySelector('#btn-playtest').textContent,
      editDisplay: document.querySelector('#edit-tools').style.display,
      status: document.querySelector('#status').textContent,
    }));

    // Repair the dangling cell link through the same visible tool; base validation becomes clean.
    await replaceControlValue(page, '#tool-value', 0);
    await clickCanvasCell(page, 1, 0);
    await page.click('#btn-validate');
    const validBase = await page.evaluate(() => ({
      status: document.querySelector('#validation-summary').dataset.status,
      errors: Number(document.querySelector('#validation-summary').dataset.errors),
      warnings: Number(document.querySelector('#validation-summary').dataset.warnings),
    }));
    const validPayload = await page.evaluate(() => window.__author.exportModule());
    const exportedMapName = validPayload ? JSON.parse(validPayload.content).maps[0].name : null;

    // Strict campaign checks are a visible opt-in, not an unconditional block on valid drafts.
    await page.click('#validate-complete-campaign');
    await page.click('#btn-validate');
    const strictReport = await page.evaluate(() => ({
      status: document.querySelector('#validation-summary').dataset.status,
      codes: [...document.querySelectorAll('#validation-findings li')].map((li) => li.dataset.code),
    }));
    await page.click('#validate-complete-campaign');

    // The file chooser path is real. Author must reject two maps before mutating the open draft.
    const chooserPromise = page.waitForFileChooser();
    await page.click('#btn-import');
    const chooser = await chooserPromise;
    await chooser.accept([multiMapPath]);
    await page.waitForFunction(
      () => document.querySelector('#status').textContent.includes('Import blocked'),
      { timeout: 10000 },
    );
    const rejectedImport = await page.evaluate(() => ({
      moduleName: document.querySelector('#module-name').value,
      mapName: document.querySelector('#map-name').value,
      status: document.querySelector('#validation-summary').dataset.status,
      codes: [...document.querySelectorAll('#validation-findings li')].map((li) => li.dataset.code),
    }));

    // Seed non-empty art through a real file too: rejection must retain pixels, not just a
    // coincidentally empty gallery. Export bytes cover all draft data; snapshot the UI/seams too.
    const artDraft = JSON.parse(validPayload.content);
    artDraft._graphicSets = [{ name: 'OWNED ART', kind: 'bigpic', frames: [[7, {
      width: 2, height: 1, xOffset: 0, yOffset: 0, transparentIndex: null,
      palette: { source: 'author-e2e', colors: [{ r: 0, g: 0, b: 0 }, { r: 255, g: 128, b: 64 }] },
      indices: 'AAE=',
    }]] }];
    const artDraftPath = resolve(tempRoot, 'art-draft.gbmod');
    writeFileSync(artDraftPath, JSON.stringify(artDraft), 'utf8');
    const artChooserPromise = page.waitForFileChooser();
    await page.click('#btn-import');
    await (await artChooserPromise).accept([artDraftPath]);
    await page.waitForFunction(() => window.__author.artFrameCount() === 1, { timeout: 10000 });
    const snapshotDraft = () => page.evaluate(() => ({
      exported: window.__author.exportModule(),
      dims: window.__author.dims(), events: window.__author.events(), db: window.__author.db(),
      moduleName: document.querySelector('#module-name').value,
      mapName: document.querySelector('#map-name').value,
      artCount: window.__author.artFrameCount(), artIndex: window.__author.artIndex(),
      artLabel: document.querySelector('#art-label').textContent,
      artPixels: document.querySelector('#art-canvas').toDataURL(),
    }));
    const beforeMalformed = await snapshotDraft();
    let malformedRejectedOk = beforeMalformed.exported !== null && beforeMalformed.artCount === 1;
    const shapeError = 'deserializeModulePackage: not a ModulePackage-shaped object';
    for (const [name, sets] of [
      ['null-art', null],
      ['numeric-indices', [{ ...artDraft._graphicSets[0], frames: [[7, {
        ...artDraft._graphicSets[0].frames[0][1], indices: 123,
      }]] }]],
    ]) {
      const path = resolve(tempRoot, `${name}.gbmod`);
      writeFileSync(path, JSON.stringify({ ...artDraft, title: 'Must not replace draft', _graphicSets: sets }), 'utf8');
      // Clear the previous status through a visible action so the next wait cannot pass stale.
      await page.click('#btn-validate');
      const malformedChooserPromise = page.waitForFileChooser();
      await page.click('#btn-import');
      await (await malformedChooserPromise).accept([path]);
      await page.waitForFunction(
        (message) => document.querySelector('#status').textContent === `Import failed: ${message}`,
        { timeout: 10000 }, shapeError,
      );
      const afterMalformed = await snapshotDraft();
      malformedRejectedOk = malformedRejectedOk &&
        JSON.stringify(afterMalformed) === JSON.stringify(beforeMalformed);
    }

    const invalidOk = invalidBase.status === 'invalid' && invalidBase.errors > 0 &&
      invalidBase.codes.includes('cell.event_dangling');
    const exportBlockedOk = seamExport === null && exportStatus.includes('Export blocked');
    const playtestBlockedOk = playtestBlocked.button === 'Playtest' && playtestBlocked.editDisplay !== 'none' &&
      playtestBlocked.status.includes('Playtest blocked');
    const repairedOk = validBase.status === 'valid' && validBase.errors === 0 && validBase.warnings === 0 &&
      exportedMapName === 'Visible Validation Map';
    const strictOptionalOk = strictReport.status === 'invalid' && strictReport.codes.includes('campaign.choice_missing');
    const multiMapRejectedOk = rejectedImport.moduleName === 'Visible Validation Draft' &&
      rejectedImport.mapName === 'Visible Validation Map' && rejectedImport.status === 'invalid' &&
      rejectedImport.codes.includes('author.map_count');

    pass = invalidOk && exportBlockedOk && playtestBlockedOk && repairedOk && strictOptionalOk &&
      multiMapRejectedOk && malformedRejectedOk && errors.length === 0 && bad.length === 0;
    detail = `invalid=${invalidOk} export=${exportBlockedOk} playtest=${playtestBlockedOk} ` +
      `repaired=${repairedOk} strict=${strictOptionalOk} multiMap=${multiMapRejectedOk} malformedArt=${malformedRejectedOk}`;
  } catch (e) {
    errors.push(`visible-validation-controls: ${e.message}`);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    await page.close();
  }
  return {
    id: 'visible-validation-controls',
    label: 'Visible map name + validation block export/playtest/multi-map import',
    detail, errors, bad, pass,
  };
}

// Item 20 golden: create the copyright-clean reference package entirely through visible Author
// controls, validate it in strict mode, download it twice byte-identically, import that exact file
// through the public chooser, download it again unchanged, and replay every visible branch.
async function runGreyfenReferenceCampaign(browser) {
  const { page, errors, bad } = await newPage(browser);
  const tempRoot = resolve(process.cwd(), 'tmp', 'greyfen-reference-e2e');
  const downloadRoot = resolve(tempRoot, 'downloads');
  const downloadedPath = resolve(downloadRoot, 'the-greyfen-beacon.gbmod');
  const fixtureExists = existsSync(REFERENCE_CAMPAIGN_PATH);
  let pass = false;
  let detail = '';
  try {
    rmSync(tempRoot, { recursive: true, force: true });
    mkdirSync(downloadRoot, { recursive: true });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadRoot });

    await replaceControlValue(page, '#new-w', 3);
    await replaceControlValue(page, '#new-h', 1);
    await page.click('#btn-new');
    await replaceControlValue(page, '#module-name', 'The Greyfen Beacon');
    await replaceControlValue(page, '#map-name', 'Greyfen Causeway');

    // Re-place the default entry through the literal Entry-point tool so the artifact's east-facing
    // start is evidence from the released canvas path, not from a test seam or a hand-written file.
    await page.click('[data-tool="entry"]');
    await page.select('#entry-facing', 'east');
    await replaceControlValue(page, '#entry-id', 0);
    await clickCanvasCell(page, 0, 0);

    await page.click('[data-tool="event"]');
    await replaceControlValue(page, '#tool-value', 1);
    await clickCanvasCell(page, 1, 0);

    await page.select('#db-category', 'monsters');
    await upsertVisibleJson(page, '#db-json', '#btn-db-upsert', {
      id: 1,
      name: 'ASH MOTH',
      hitPoints: 1,
      armorClass: 20,
      thac0: 20,
      damage: { count: 1, sides: 2, bonus: 0 },
      xp: 5,
    });

    const events = [
      {
        id: 1, onceOnly: true, type: 'questionButton',
        body: {
          prompt: 'THE GREYFEN BEACON IS DARK. WILL YOU LIGHT IT?',
          options: [{ label: 'LIGHT IT', chainTo: 2 }, { label: 'WALK AWAY', chainTo: 7 }],
        },
      },
      {
        id: 2, onceOnly: true, type: 'combat',
        body: {
          intro: 'AN ASH MOTH GUARDS THE LANTERN.',
          monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
          onVictory: 3, onDefeat: 5, onFlee: 6,
        },
      },
      {
        id: 3, onceOnly: true, type: 'giveTreasure',
        body: {
          platinum: 25, gems: 0, jewelry: 0, items: [], itemsIdentified: false, chainTo: 4,
        },
      },
      { id: 4, onceOnly: true, type: 'message', body: { text: 'THE BEACON BURNS. GREYFEN IS SAFE.' } },
      { id: 5, onceOnly: true, type: 'message', body: { text: 'THE ASH MOTH CLAIMS THE BEACON.' } },
      { id: 6, onceOnly: true, type: 'message', body: { text: 'YOU ESCAPE. THE BEACON STAYS DARK.' } },
      { id: 7, onceOnly: true, type: 'message', body: { text: 'YOU LEAVE THE BEACON UNLIT.' } },
    ];
    for (const event of events) {
      await upsertVisibleJson(page, '#event-json', '#btn-event-upsert', event);
    }

    await page.click('#validate-complete-campaign');
    await page.click('#btn-validate');
    const validation = await page.evaluate(() => ({
      status: document.querySelector('#validation-summary').dataset.status,
      errors: Number(document.querySelector('#validation-summary').dataset.errors),
      warnings: Number(document.querySelector('#validation-summary').dataset.warnings),
      findings: [...document.querySelectorAll('#validation-findings li')].map((li) => ({
        code: li.dataset.code, severity: li.dataset.severity, path: li.dataset.path,
      })),
    }));

    const download = async () => {
      rmSync(downloadedPath, { force: true });
      rmSync(`${downloadedPath}.crdownload`, { force: true });
      await page.click('#btn-export');
      return waitForFile(downloadedPath);
    };
    const first = await download();
    const second = await download();

    // Re-import the literal second download after a clean New, then prove serialization did not
    // normalize, repair, or reorder a single byte.
    await page.click('#btn-new');
    const chooserPromise = page.waitForFileChooser();
    await page.click('#btn-import');
    const chooser = await chooserPromise;
    await chooser.accept([downloadedPath]);
    await page.waitForFunction(
      () => document.querySelector('#status').textContent.includes('Imported "The Greyfen Beacon"'),
      { timeout: 10000 },
    );
    const third = await download();

    const runBranch = async (choice, outcome, expectedText) => {
      await page.click('#btn-playtest');
      await page.waitForFunction(
        () => document.querySelector('#btn-playtest').textContent === 'Stop Playtest',
        { timeout: 10000 },
      );
      await page.click('#pt-forward');
      await page.waitForFunction(
        () => document.querySelector('#event-fire-choice').style.display === 'flex',
        { timeout: 10000 },
      );
      await replaceControlValue(page, '#ev-answer', choice);
      await page.click('#ev-answer-btn');
      let monsters = '';
      if (outcome) {
        await page.waitForFunction(
          () => document.querySelector('#event-fire-combat').style.display === 'flex',
          { timeout: 10000 },
        );
        monsters = await page.$eval('#event-fire-monsters', (node) => node.textContent ?? '');
        await page.click(`#ev-${outcome}`);
      }
      await page.waitForFunction(
        (expected) => (document.querySelector('#event-fire-text').textContent ?? '').includes(expected),
        { timeout: 10000 },
        expectedText,
      );
      const log = await page.$eval('#event-fire-text', (node) => node.textContent ?? '');
      await page.click('#btn-playtest');
      return { log, monsters };
    };

    const victory = await runBranch(1, 'victory', 'THE BEACON BURNS. GREYFEN IS SAFE.');
    const defeat = await runBranch(1, 'defeat', 'THE ASH MOTH CLAIMS THE BEACON.');
    const flee = await runBranch(1, 'flee', 'YOU ESCAPE. THE BEACON STAYS DARK.');
    const decline = await runBranch(2, null, 'YOU LEAVE THE BEACON UNLIT.');

    const expected = fixtureExists ? readFileSync(REFERENCE_CAMPAIGN_PATH) : null;
    const sha256 = createHash('sha256').update(second).digest('hex');
    const validationOk = validation.status === 'valid' && validation.errors === 0 &&
      validation.warnings === 0 && validation.findings.length === 0;
    const deterministicOk = first.equals(second) && second.equals(third);
    const fixtureOk = expected !== null && second.equals(expected);
    const victoryReceipt = 'Treasure received: 25 platinum, 0 gems, 0 jewelry; items: none.';
    const victoryOk = victory.monsters === '1x ASH MOTH' &&
      victory.log.includes('AN ASH MOTH GUARDS THE LANTERN.') &&
      victory.log.indexOf(victoryReceipt) >= 0 &&
      victory.log.indexOf(victoryReceipt) < victory.log.indexOf('THE BEACON BURNS. GREYFEN IS SAFE.');
    const branchesOk = victoryOk && defeat.monsters === '1x ASH MOTH' &&
      defeat.log.includes('THE ASH MOTH CLAIMS THE BEACON.') && flee.monsters === '1x ASH MOTH' &&
      flee.log.includes('YOU ESCAPE. THE BEACON STAYS DARK.') &&
      decline.log.includes('YOU LEAVE THE BEACON UNLIT.');

    if (!fixtureExists) {
      errors.push(
        `canonical fixture is missing; UI-produced capture retained at ${downloadedPath} ` +
        `(${second.byteLength} bytes, SHA-256 ${sha256})`,
      );
    }
    pass = validationOk && deterministicOk && fixtureOk && branchesOk &&
      errors.length === 0 && bad.length === 0;
    detail = `validation=${validationOk} deterministic=${deterministicOk} fixture=${fixtureOk} ` +
      `branches=${branchesOk} bytes=${second.byteLength} sha256=${sha256}`;
  } catch (error) {
    errors.push(`greyfen-reference-campaign: ${error.message}`);
  } finally {
    await page.close();
    // A missing-fixture bootstrap intentionally keeps the browser-produced download so it can be
    // inspected and added with apply_patch. Normal test runs leave no artifacts.
    if (fixtureExists) rmSync(tempRoot, { recursive: true, force: true });
  }
  return {
    id: 'greyfen-reference-campaign',
    label: 'Greyfen: visible Author controls produce one exact validated portable campaign',
    detail, errors, bad, pass,
  };
}

// Case F (M11.S4): a module imported with embedded art (`graphicSets`, base64-encoded pixel data
// under `_graphicSets` — see engine `module/serialize.ts`) renders its scene art in playtest (the
// imported-art panel, `#art-panel`/`window.__author.artFrameCount()`, decodes + paints real pixel
// data — not just carries the field through JSON), is deliberately cleared by "New" so imported
// provenance cannot leak into a fresh package, and returns through Export -> New -> Import without
// being dropped from the exported artifact. Hand-authors the `.gbmod` wire JSON directly (this
// plain-`node` test has
// no loader for `@goldbox/engine` TS source, so it can't call `serializeModulePackage` itself —
// matches how the rest of this file hand-authors event/db JSON rather than importing the engine).
async function runImportedArtPlaytest(browser) {
  const { page, errors, bad } = await newPage(browser);
  let pass = false;
  let detail = '';
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitAuthor(page);

    const indicesB64 = Buffer.from(Uint8Array.from([0, 1, 2, 3])).toString('base64');
    const gbmod = JSON.stringify({
      schema: 1,
      id: 'e2e-art-module',
      title: 'E2E Art Module',
      ruleset: 'addnd1e',
      maps: [{
        name: 'Art Room', width: 1, height: 1,
        cells: [{ walls: { north: 1, east: 1, south: 1, west: 1 } }],
        entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
        events: [],
      }],
      entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
      _graphicSets: [{
        name: 'E2E_ART',
        kind: 'bigpic',
        frames: [[0, {
          width: 2, height: 2, indices: indicesB64,
          xOffset: 0, yOffset: 0, transparentIndex: null,
          palette: {
            colors: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 255, g: 255, b: 0 }],
            source: 'hlib-range',
          },
        }]],
      }],
    });

    await page.evaluate((json) => window.__author.importModuleJson(json), gbmod);
    const frameCountAfterImport = await page.evaluate(() => window.__author.artFrameCount());
    const panelVisibleAfterImport = await page.evaluate(() => document.querySelector('#art-panel').style.display);
    const canvasDimsAfterImport = await page.evaluate(() => {
      const c = document.querySelector('#art-canvas');
      return { w: c.width, h: c.height };
    });

    // Export, then re-import into a blank editor — the SAME art must survive that round trip too.
    const exported = await page.evaluate(() => window.__author.exportModule());
    await page.evaluate(() => window.__author.newMap(3, 3));
    // New creates a genuinely clean module; only importing the exported artifact restores its art.
    const frameCountAfterNew = await page.evaluate(() => window.__author.artFrameCount());
    await page.evaluate((content) => window.__author.importModuleJson(content), exported.content);
    const frameCountAfterReimport = await page.evaluate(() => window.__author.artFrameCount());

    // The art panel isn't edit-mode-only — it stays up while playtesting the same package.
    await page.evaluate(() => { window.__author.setEntryId(0); window.__author.startPlaytest(); });
    const panelVisibleInPlaytest = await page.evaluate(() => document.querySelector('#art-panel').style.display);
    await page.evaluate(() => window.__author.stopPlaytest());

    const importedOk = frameCountAfterImport === 1 && panelVisibleAfterImport === 'block' &&
      canvasDimsAfterImport.w === 2 && canvasDimsAfterImport.h === 2;
    const clearedByNewOk = frameCountAfterNew === 0;
    const roundTrippedOk = exported.content.includes('_graphicSets') && exported.content.includes('E2E_ART') && frameCountAfterReimport === 1;
    const playtestOk = panelVisibleInPlaytest === 'block';

    pass = importedOk && clearedByNewOk && roundTrippedOk && playtestOk && errors.length === 0 && bad.length === 0;
    detail = `imported=${importedOk} clearedByNew=${clearedByNewOk} roundTripped=${roundTrippedOk} playtest=${playtestOk}`;
  } catch (e) {
    errors.push(`imported-art-playtest: ${e.message}`);
  }
  await page.close();
  return { id: 'imported-art-playtest', label: 'Imported module art (graphicSets) round-trips + renders in playtest (M11.S4 G4)', detail, errors, bad, pass };
}

async function main() {
  if (!existsSync(EDGE)) {
    console.error(`SKIP: Edge not found at ${EDGE}`);
    process.exit(0);
  }
  console.log(`[e2e] starting vite on :${PORT} ...`);
  const viteBin = 'node_modules/vite/bin/vite.js';
  if (!existsSync(viteBin)) { console.error(`[e2e] ${viteBin} not found (run npm install)`); process.exit(1); }
  const vite = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort', '--clearScreen', 'false'], { cwd: process.cwd() });
  vite.stderr.on('data', (b) => { const s = b.toString(); if (/error/i.test(s)) process.stderr.write(`[vite] ${s}`); });
  try {
    await waitForServer(vite);
  } catch (e) {
    console.error(`[e2e] FAILED to start dev server: ${e.message}`);
    vite.kill();
    process.exit(1);
  }
  console.log('[e2e] dev server up; launching Edge (headless) ...');
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const results = [
    await runEditSaveReloadPlaytest(browser),
    await runRealCanvasClick(browser),
    await runEventChainPlaytest(browser),
    await runDatabaseAndRulesetPlaytest(browser),
    await runNamedModuleExportImport(browser),
    await runVisibleValidationControls(browser),
    await runGreyfenReferenceCampaign(browser),
    await runImportedArtPlaytest(browser),
  ];

  await browser.close();
  vite.kill();

  console.log('\n=== e2e results ===');
  let failed = 0;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : (++failed, 'FAIL');
    console.log(`  [${tag}] ${r.label.padEnd(48)}` +
      (r.detail ? `  ${r.detail}` : '') +
      (r.errors.length ? `  errors: ${r.errors.slice(0, 2).join(' | ')}` : '') +
      (r.bad && r.bad.length ? `  http: ${r.bad.slice(0, 2).join(' | ')}` : ''));
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
