// Packaged-artifact smoke test (M6.S2). Launches the electron-builder portable .exe directly —
// no pnpm/dev toolchain, no `electron <entry>` invocation — and re-runs the same real-fs
// detection check M6.S1's e2e proves against the dev tree, confirming the packaged app reaches
// the same booted-Library state standalone.
//
//   node test/e2e-packaged.mjs [path-to-exe]
//
// Defaults to release/Greybox */*.exe if not given. SKIPs (exit 0) if no packaged exe is found
// (fresh clone / package not built yet) so CI without a release build stays green.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(ELECTRON_DIR, '..', '..');
const COK_DOS_FOLDER = resolve(REPO_ROOT, 'Champions of Krynn');
const PACKAGED_PROFILES = resolve(ELECTRON_DIR, 'tmp', 'packaged-profiles');
// P6's canonical artifact is intentionally external input to the packaged executable. The final
// campaign route uses this same repository file in Author, browser, and Electron; it is not copied
// into app resources or reconstructed by an e2e-only seam.
const REFERENCE_CAMPAIGN_GBMOD = resolve(
  REPO_ROOT,
  'packages',
  'engine',
  'test',
  'fixtures',
  'the-greyfen-beacon.gbmod',
);
const REFERENCE_CAMPAIGN = Object.freeze({
  id: 'the-greyfen-beacon',
  title: 'The Greyfen Beacon',
  mapName: 'Greyfen Causeway',
  packageByteLength: 1503,
  packageSha256: 'b5fdc35ece34631c6787c97476a7d57b6b214c288885b8626810b3d4fb7c1077',
  question: 'THE GREYFEN BEACON IS DARK. WILL YOU LIGHT IT?',
  combatIntro: 'AN ASH MOTH GUARDS THE LANTERN.',
  reward: 'Treasure received: 25 platinum, 0 gems, 0 jewelry; items: none.',
  terminal: 'THE BEACON BURNS. GREYFEN IS SAFE.',
});

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function countText(text, needle) {
  return text.split(needle).length - 1;
}

function requireEvidence(condition, message, evidence) {
  if (condition) return;
  throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}

/**
 * Click a control the way the dev-tree Electron suite does: assert it is laid out and visible,
 * then dispatch the element's own `click()` inside the page.
 *
 * `page.click()` cannot be used against the packaged window. Puppeteer gates it on
 * `isIntersectingViewport`, which resolves an IntersectionObserver callback -- and the packaged
 * app's renderer does not deliver those to a window that is never composited, so the CDP call
 * simply never returns and the run dies on protocolTimeout rather than any assertion. The checks
 * below are the visibility evidence `page.click()` would have given us, made explicit.
 */
async function clickVisible(page, selector, label) {
  await page.waitForSelector(selector, { timeout: 30000 });
  const evidence = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return { found: false };
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
      style.visibility !== 'hidden' && Number(style.opacity) > 0 && node.offsetParent !== null &&
      !node.disabled;
    if (visible) node.click();
    return {
      found: true, visible, width: rect.width, height: rect.height,
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      offsetParent: node.offsetParent !== null, disabled: !!node.disabled,
    };
  }, selector);
  requireEvidence(evidence.found && evidence.visible, `${label} was not a visible clickable control`, {
    selector, ...evidence,
  });
  return evidence;
}

/**
 * Select a real `.gbmod` through Chromium's public file input and return package-identity evidence
 * from the Library. This helper deliberately does not use Electron's gated arbitrary-path IPC.
 * The item-20 route calls it from the normal packaged launch, then clicks `libraryIndex` and drives
 * gameplay through the same renderer UI as the browser acceptance route.
 */
async function importModuleThroughFileChooser(page, modulePath = REFERENCE_CAMPAIGN_GBMOD) {
  if (!existsSync(modulePath)) throw new Error(`reference campaign artifact is missing: ${modulePath}`);
  const raw = readFileSync(modulePath);
  const expected = {
    fileName: basename(modulePath),
    packageText: raw.toString('utf8'),
    packageByteLength: raw.byteLength,
    packageSha256: createHash('sha256').update(raw).digest('hex'),
  };
  requireEvidence(
    expected.packageByteLength === REFERENCE_CAMPAIGN.packageByteLength &&
      expected.packageSha256 === REFERENCE_CAMPAIGN.packageSha256,
    'repository reference campaign bytes no longer match the canonical packaged contract',
    {
      path: modulePath,
      packageByteLength: expected.packageByteLength,
      packageSha256: expected.packageSha256,
    },
  );

  // `page.waitForFileChooser()` cannot be used here. It needs Chrome's `Page.fileChooserOpened`
  // CDP event, and the packaged Electron browser process serves `<input type=file>` from its own
  // native dialog without emitting it -- so the click merely opened a modal nobody could answer
  // and the wait timed out after 30 s. `uploadFile` sets the input's FileList over CDP and fires
  // the same `change` event the real dialog would, so the import still runs through the renderer's
  // ordinary public path (`#module-input` change -> importModuleFile), not an e2e-only seam. Only
  // the OS dialog itself is bypassed, which is untestable from here in any case; the button that
  // opens it is asserted present and wired to this input below.
  await page.waitForSelector('#import-module-btn', { timeout: 30000 });
  const wiring = await page.evaluate(() => {
    const button = document.querySelector('#import-module-btn');
    const input = document.querySelector('#module-input');
    return { button: !!button, input: !!input, accept: input?.getAttribute('accept') ?? null };
  });
  requireEvidence(wiring.button && wiring.input, 'packaged Library import controls are missing', wiring);
  const input = await page.waitForSelector('#module-input', { timeout: 30000 });
  await input.uploadFile(modulePath);
  await page.waitForFunction(
    (sha256) => window.__greybox.getLibrary().some((entry) => entry.packageSha256 === sha256),
    { timeout: 30000 },
    expected.packageSha256,
  );

  const library = await page.evaluate('window.__greybox.getLibrary()');
  const libraryIndex = library.findIndex((entry) => entry.packageSha256 === expected.packageSha256);
  const entry = library[libraryIndex];
  const row = await page.$$eval('.lib-entry', (nodes, index) => {
    const node = nodes[index];
    return node ? {
      text: node.textContent ?? '',
      packageSha256: node.dataset.moduleSha256,
      packageByteLength: Number(node.dataset.moduleByteLength),
      validationWarnings: Number(node.dataset.moduleValidationWarnings),
    } : null;
  }, libraryIndex);
  if (libraryIndex < 0 || !entry || !row || entry.fileName !== expected.fileName ||
      entry.packageText !== expected.packageText ||
      entry.packageByteLength !== expected.packageByteLength ||
      entry.packageSha256 !== expected.packageSha256 || entry.validation?.ok !== true ||
      entry.validation?.warnings?.length !== 0 ||
      row.packageSha256 !== expected.packageSha256 ||
      row.packageByteLength !== expected.packageByteLength || row.validationWarnings !== 0) {
    throw new Error(`packaged Library artifact evidence mismatch: ${JSON.stringify({
      expected: {
        fileName: expected.fileName,
        packageByteLength: expected.packageByteLength,
        packageSha256: expected.packageSha256,
      },
      entry: entry ? {
        title: entry.title,
        moduleId: entry.moduleId,
        fileName: entry.fileName,
        packageByteLength: entry.packageByteLength,
        packageSha256: entry.packageSha256,
        validation: entry.validation,
      } : null,
      row,
    })}`);
  }
  return { ...expected, entry, row, libraryIndex };
}

async function selectReferenceCampaign(page, imported) {
  const selector = `.lib-entry[data-lib-index="${imported.libraryIndex}"]`;
  await page.waitForSelector(selector, { timeout: 30000 });
  await clickVisible(page, selector, 'packaged Library entry');
  await page.waitForFunction(
    ({ title, mapName }) => window.__module?.loaded?.() === true &&
      window.__module.title() === title && window.__module.mapName() === mapName,
    { timeout: 30000 },
    REFERENCE_CAMPAIGN,
  );
  const boot = await page.evaluate(() => ({
    title: window.__module.title(),
    mapName: window.__module.mapName(),
    dims: window.__module.dims(),
    pose: window.__module.getPose(),
    eventState: window.__module.eventState(),
    receipts: window.__module.treasureReceipts(),
  }));
  requireEvidence(
    boot.title === REFERENCE_CAMPAIGN.title && boot.mapName === REFERENCE_CAMPAIGN.mapName &&
      sameJson(boot.dims, { w: 3, h: 1 }) && sameJson(boot.pose, { x: 0, y: 0, facing: 'east' }) &&
      sameJson(boot.eventState?.consumedEventIds, []) && boot.receipts.length === 0,
    'packaged reference campaign did not boot at its authored entry point',
    boot,
  );
  return boot;
}

async function readModuleEvidence(page) {
  return page.evaluate(() => ({
    pose: window.__module?.getPose?.() ?? null,
    awaiting: window.__module?.awaiting?.() ?? null,
    log: window.__module?.eventLog?.() ?? '',
    eventState: window.__module?.eventState?.() ?? null,
    receipts: window.__module?.treasureReceipts?.() ?? [],
    receiptPanel: document.querySelector('#module-treasure-receipts')?.textContent ?? '',
    status: document.querySelector('#status')?.textContent ?? '',
  }));
}

/**
 * Finish the canonical positive route using ordinary renderer controls. The only reads through
 * `__module`/`__combat` are assertions; no outcome, movement, choice, save, or load is injected
 * through a test seam.
 */
async function playReferenceCampaignVictory(page) {
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(
    (question) => window.__module?.awaiting?.() === 'choice' &&
      window.__module.eventLog().includes(question),
    { timeout: 30000 },
    REFERENCE_CAMPAIGN.question,
  );
  const questionUi = await page.evaluate(() => {
    const row = document.querySelector('#module-choice-row');
    const input = document.querySelector('#module-answer');
    const button = row?.querySelector('button');
    return {
      rowVisible: row instanceof HTMLElement && getComputedStyle(row).display !== 'none',
      inputVisible: input instanceof HTMLElement && input.offsetParent !== null,
      buttonVisible: button instanceof HTMLElement && button.offsetParent !== null,
      buttonText: button?.textContent ?? '',
    };
  });
  requireEvidence(
    questionUi.rowVisible && questionUi.inputVisible && questionUi.buttonVisible &&
      questionUi.buttonText.trim() === 'Answer',
    'packaged reference campaign did not expose its visible choice controls',
    questionUi,
  );

  await clickVisible(page, '#module-answer', 'packaged module answer field');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type('1');
  await clickVisible(page, '#module-choice-row button', 'packaged module Answer button');
  await page.waitForFunction(
    () => window.__module?.awaiting?.() === 'combat' &&
      window.__module.combatLaunching() === true && window.__combat?.isOverlay?.() === true,
    { timeout: 30000 },
  );
  const combatStart = await page.evaluate(() => ({
    phase: window.__combat.phase(),
    overlay: window.__combat.isOverlay(),
    combatants: window.__combat.combatants(),
    assets: window.__combat.assetPaths(),
    moduleLog: window.__module.eventLog(),
    monsterSource: window.__module.monsterSource(),
  }));
  const enemies = combatStart.combatants.filter((combatant) => combatant.side === 'enemy');
  requireEvidence(
    combatStart.overlay === true && combatStart.phase === 'party-menu' &&
      enemies.length === 1 && enemies[0].name === 'ASH MOTH' &&
      enemies[0].id === 'authored-e2-0' && combatStart.monsterSource === null &&
      Object.values(combatStart.assets).every(
        (assetPath) => assetPath === `${REFERENCE_CAMPAIGN.id}:authored-no-art`,
      ) &&
      combatStart.moduleLog === [
        REFERENCE_CAMPAIGN.question,
        '1) LIGHT IT',
        '2) WALK AWAY',
        REFERENCE_CAMPAIGN.combatIntro,
      ].join('\n'),
    'packaged reference campaign did not launch its exact authored tactical encounter',
    combatStart,
  );

  let quickPresses = 0;
  for (; quickPresses < 64; quickPresses++) {
    const phase = await page.evaluate('window.__combat?.phase?.() ?? "missing"');
    if (phase === 'continue-battle') break;
    requireEvidence(phase === 'party-menu', 'ordinary Quick route reached an unexpected combat phase', {
      phase,
      quickPresses,
    });
    await page.keyboard.press('q');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const quickResult = await page.evaluate(() => ({
    phase: window.__combat.phase(),
    outcome: window.__combat.outcome(),
    over: window.__combat.isOver(),
    log: window.__combat.log(),
  }));
  requireEvidence(
    quickPresses > 0 && quickResult.phase === 'continue-battle' &&
      quickResult.outcome === 'party' && quickResult.over === true &&
      quickResult.log.some((line) => /fights quickly\./.test(line)),
    'ordinary Q-key combat did not produce the authored victory',
    { quickPresses, quickResult },
  );

  // Retail-style result controls: No to "continue battle", acknowledge victory, dismiss overlay.
  await page.keyboard.press('n');
  await page.waitForFunction('window.__combat?.phase?.() === "victory"', { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction('window.__combat?.phase?.() === "over"', { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    'window.__module?.awaiting?.() === null && window.__combat?.isOverlay?.() === false',
    { timeout: 30000 },
  );

  const won = await readModuleEvidence(page);
  const expectedLog = [
    REFERENCE_CAMPAIGN.question,
    '1) LIGHT IT',
    '2) WALK AWAY',
    REFERENCE_CAMPAIGN.combatIntro,
    REFERENCE_CAMPAIGN.reward,
    REFERENCE_CAMPAIGN.terminal,
  ].join('\n');
  const receipt = won.receipts[0];
  requireEvidence(
    sameJson(won.pose, { x: 1, y: 0, facing: 'east' }) && won.awaiting === null &&
      won.log === expectedLog && sameJson(won.eventState?.consumedEventIds, [1, 2, 3, 4]) &&
      won.receipts.length === 1 && receipt?.eventId === 3 && receipt?.platinum === 25 &&
      receipt?.gems === 0 && receipt?.jewelry === 0 && receipt?.itemsIdentified === false &&
      sameJson(receipt?.items, []) && countText(won.log, REFERENCE_CAMPAIGN.reward) === 1 &&
      countText(won.log, REFERENCE_CAMPAIGN.terminal) === 1,
    'packaged reference campaign victory did not preserve ordered reward/terminal evidence',
    won,
  );

  // Step off and revisit the event cell using ordinary arrow keys. Every event in the route is
  // once-only, so neither its prompt, combat, reward, nor terminal may run again.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () => window.__module?.getPose?.().x === 1 && window.__module?.awaiting?.() === null,
    { timeout: 10000 },
  );
  const revisit = await readModuleEvidence(page);
  requireEvidence(
    revisit.log === '' && sameJson(revisit.eventState?.consumedEventIds, [1, 2, 3, 4]) &&
      revisit.receipts.length === 1 && countText(revisit.receiptPanel, REFERENCE_CAMPAIGN.reward) === 1 &&
      !revisit.receiptPanel.includes(REFERENCE_CAMPAIGN.terminal),
    'packaged reference campaign once-only revisit repeated authored effects',
    revisit,
  );

  return { quickPresses, won, revisit };
}

async function saveReloadReferenceCampaign(page) {
  // Save from the terminal cell through the real button, then perform a full renderer restart.
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction('window.__module?.getPose?.().x === 2', { timeout: 10000 });
  await clickVisible(page, '#module-save', 'packaged module Save button');
  const saved = await page.evaluate(() => ({
    key: window.__module.saveKey(),
    raw: localStorage.getItem(window.__module.saveKey()),
    pose: window.__module.getPose(),
    state: window.__module.eventState(),
  }));
  requireEvidence(
    typeof saved.raw === 'string' && saved.raw.length > 0 &&
      sameJson(saved.pose, { x: 2, y: 0, facing: 'east' }) &&
      sameJson(saved.state?.consumedEventIds, [1, 2, 3, 4]),
    'visible packaged Save did not persist the completed reference campaign',
    saved,
  );

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    'window.__greybox && typeof window.electronAPI === "object"',
    { timeout: 60000 },
  );
  const reimported = await importModuleThroughFileChooser(page);
  await selectReferenceCampaign(page, reimported);
  const fresh = await readModuleEvidence(page);
  requireEvidence(
    sameJson(fresh.pose, { x: 0, y: 0, facing: 'east' }) &&
      sameJson(fresh.eventState?.consumedEventIds, []) && fresh.receipts.length === 0,
    'renderer restart did not begin from a fresh in-memory reference session before Load',
    fresh,
  );

  await clickVisible(page, '#module-load', 'packaged module Load button');
  await page.waitForFunction(
    () => window.__module?.getPose?.().x === 2 &&
      JSON.stringify(window.__module?.eventState?.().consumedEventIds) === '[1,2,3,4]',
    { timeout: 10000 },
  );
  const loaded = await readModuleEvidence(page);
  requireEvidence(
    sameJson(loaded.pose, { x: 2, y: 0, facing: 'east' }) && loaded.awaiting === null &&
      sameJson(loaded.eventState?.consumedEventIds, [1, 2, 3, 4]) && loaded.receipts.length === 1 &&
      countText(loaded.receiptPanel, REFERENCE_CAMPAIGN.reward) === 1,
    'visible packaged Load did not restore position, consumption, and one reward receipt',
    loaded,
  );

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction('window.__module?.getPose?.().x === 1', { timeout: 10000 });
  const loadedRevisit = await readModuleEvidence(page);
  requireEvidence(
    loadedRevisit.log === '' &&
      sameJson(loadedRevisit.eventState?.consumedEventIds, [1, 2, 3, 4]) &&
      loadedRevisit.receipts.length === 1 &&
      countText(loadedRevisit.receiptPanel, REFERENCE_CAMPAIGN.reward) === 1,
    'loaded packaged session repeated the once-only route on revisit',
    loadedRevisit,
  );

  return { saved, reimported, fresh, loaded, loadedRevisit };
}

function childElectronEnv(enabled) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'GOLDBOX_ELECTRON_E2E'),
  );
  if (enabled) env.GOLDBOX_ELECTRON_E2E = '1';
  return env;
}

function findPackagedExe() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  const releaseDir = resolve(ELECTRON_DIR, 'release');
  if (!existsSync(releaseDir)) return null;
  const exe = readdirSync(releaseDir).find((f) => f.toLowerCase().endsWith('.exe'));
  return exe ? resolve(releaseDir, exe) : null;
}

async function waitForCdp(port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`packaged app's CDP endpoint did not answer on :${port} within ${deadlineMs}ms`);
}

async function runPackaged(exePath, e2eEnabled, port, profileName) {
  const profile = resolve(PACKAGED_PROFILES, profileName);
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  mkdirSync(profile, { recursive: true });
  console.log(`[e2e-packaged] launching ${e2eEnabled ? 'gated' : 'normal'} ${exePath} ...`);
  const proc = spawn(
    exePath,
    [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--disable-gpu', '--no-sandbox'],
    { cwd: dirname(exePath), env: childElectronEnv(e2eEnabled) },
  );
  let exited = false;
  let exitCode = null;
  proc.on('exit', (code) => { exited = true; exitCode = code; });

  let browser;
  try {
    await waitForCdp(port, 60000); // portable exe self-extracts on first launch
    if (exited) throw new Error(`packaged app exited early (code ${exitCode})`);
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, protocolTimeout: 60000 });
    let page = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !page) {
      const pages = await browser.pages();
      page = pages.find((candidate) => /web-dist-app|index\.html/.test(candidate.url())) ?? pages[0] ?? null;
      if (!page) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!page) throw new Error('no renderer page target found in the packaged app');

    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await page.waitForFunction('window.__greybox && typeof window.electronAPI === "object"', { timeout: 60000 });

    if (!e2eEnabled) {
      const boundary = await page.evaluate(() => ({
        picker: typeof window.electronAPI.pickFolder,
        testPicker: typeof window.electronAPI.pickFolderForTest,
        addTestFolder: typeof window.__greybox.addFromElectronFolder,
        importTestFrua: typeof window.__greybox.importFruaFromElectronFolder,
      }));
      const boundaryOk = boundary.picker === 'function' && boundary.testPicker === 'undefined' &&
        boundary.addTestFolder === 'undefined' && boundary.importTestFrua === 'undefined';
      requireEvidence(
        boundaryOk,
        'normal packaged launch exposed an arbitrary-path test capability',
        boundary,
      );

      const imported = await importModuleThroughFileChooser(page);
      requireEvidence(
        imported.entry.title === REFERENCE_CAMPAIGN.title &&
          imported.entry.moduleId === REFERENCE_CAMPAIGN.id,
        'normal packaged launch imported the wrong reference campaign identity',
        { title: imported.entry.title, moduleId: imported.entry.moduleId },
      );
      await selectReferenceCampaign(page, imported);
      const campaign = await playReferenceCampaignVictory(page);
      const saveReload = await saveReloadReferenceCampaign(page);
      return {
        id: 'packaged-production-reference-campaign',
        label: 'Packaged .exe: normal security boundary + exact Greyfen import/play/save/restart/load',
        pass: boundaryOk && errors.length === 0,
        detail: `boundary=${JSON.stringify(boundary)} artifact=${JSON.stringify({
          fileName: imported.fileName,
          bytes: imported.packageByteLength,
          sha256: imported.packageSha256,
          validationWarnings: imported.entry.validation.warnings.length,
        })} quickPresses=${campaign.quickPresses} saved=${saveReload.saved.key} errors=${JSON.stringify(errors)}`,
      };
    }

    await page.waitForFunction('typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    const testPicker = await page.evaluate('typeof window.electronAPI.pickFolderForTest');
    const result = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), COK_DOS_FOLDER);
    const lib = await page.evaluate('window.__greybox.getLibrary()');
    const detected = result?.ok && result?.match?.profileId === 'champions-of-krynn' && result?.match?.platform === 'DOS';
    const inLibrary = Array.isArray(lib) && lib.some((entry) => entry.profileId === 'champions-of-krynn' && entry.platform === 'DOS');
    return {
      id: 'packaged-boot',
      label: 'Packaged .exe: explicit e2e gate + native fs detect (M6.S2)',
      pass: testPicker === 'function' && detected && inLibrary && errors.length === 0,
      detail: `testPicker=${testPicker} result=${JSON.stringify(result)} inLibrary=${inLibrary} errors=${JSON.stringify(errors)}`,
    };
  } catch (error) {
    return {
      id: e2eEnabled ? 'packaged-boot' : 'packaged-production-reference-campaign',
      label: `Packaged .exe ${e2eEnabled ? 'gated smoke' : 'normal security + reference campaign'} test`,
      pass: false,
      detail: error instanceof Error ? `${error.message}
${error.stack ?? ''}` : String(error),
    };
  } finally {
    try { await browser?.close(); } catch {
      try { browser?.disconnect(); } catch { /* ignore */ }
    }
    if (!exited) {
      proc.kill();
      await new Promise((resolve) => {
        if (exited) return resolve();
        const timer = setTimeout(resolve, 5000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

async function main() {
  const exePath = findPackagedExe();
  if (!exePath || !existsSync(exePath)) {
    console.error('SKIP: no packaged .exe found — run "npm run package" first.');
    process.exit(0);
  }
  rmSync(PACKAGED_PROFILES, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  mkdirSync(PACKAGED_PROFILES, { recursive: true });
  const results = [await runPackaged(exePath, false, 9225, 'normal')];
  if (existsSync(COK_DOS_FOLDER)) {
    results.push(await runPackaged(exePath, true, 9226, 'gated'));
  } else {
    console.error(`SKIP: gated native-folder phase needs ${COK_DOS_FOLDER}; ungated boundary still ran.`);
  }
  rmSync(PACKAGED_PROFILES, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });

  console.log('\n=== packaged e2e results ===');
  let failed = 0;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : (++failed, 'FAIL');
    console.log(`  [${tag}] ${r.label}` + (r.pass ? '' : `  ${r.detail}`));
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
