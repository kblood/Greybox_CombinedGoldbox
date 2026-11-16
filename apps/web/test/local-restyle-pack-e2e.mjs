import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Load exact admitted files from an external user's Restyle folder, never from the candidate. */
export function readPinnedLocalRestyleFiles(entries, root = process.env.GB_RESTYLE_PACK_DIR) {
  assert.ok(root, 'Set GB_RESTYLE_PACK_DIR to the local Restyle folder (the contents of restyle/)');
  const base = resolve(root);
  return entries.map(({ path, sha256 }) => {
    const normalized = path.replaceAll('\\', '/');
    assert.ok(normalized && !normalized.startsWith('/') && !normalized.split('/').includes('..'),
      `Unsafe Restyle path: ${path}`);
    const filePath = resolve(base, ...normalized.split('/'));
    assert.ok(filePath.startsWith(`${base}${sep}`), `Restyle path escaped its selected folder: ${path}`);
    const bytes = readFileSync(filePath);
    assert.equal(sha(bytes), sha256, `Local Restyle input hash: ${path}`);
    return { name: normalized.split('/').at(-1), relativePath: `restyle/${normalized}`,
      type: 'image/png', base64: bytes.toString('base64') };
  });
}

/** Read only the named archives from a real external DOS install and Amiga extraction. */
export function readPinnedCokInstallFiles(entries) {
  const rows = [];
  for (const { edition, rootEnv, relativePath, sha256 } of entries) {
    const root = process.env[rootEnv];
    assert.ok(root, `Set ${rootEnv} to the local ${edition} CoK source folder`);
    const base = resolve(root);
    const normalized = relativePath.replaceAll('\\', '/');
    assert.ok(normalized && !normalized.startsWith('/') && !normalized.split('/').includes('..'),
      `Unsafe game archive path: ${relativePath}`);
    const filePath = resolve(base, ...normalized.split('/'));
    assert.ok(filePath.startsWith(`${base}${sep}`), `Game archive escaped selected source folder: ${relativePath}`);
    const bytes = readFileSync(filePath);
    if (sha256) assert.equal(sha(bytes), sha256, `${edition} source archive SHA-256: ${relativePath}`);
    const name = normalized.split('/').at(-1);
    rows.push({ name, relativePath: `cok-selected/${edition}/${normalized}`, type: 'application/octet-stream',
      base64: bytes.toString('base64') });
  }
  return rows;
}

/** A minimal real CoK DOS install for the full ECL demo, plus the separately extracted Amiga scene. */
export function readCokDemoInstallFiles(manifest, { extraDosPaths = [], extraDosPins = {} } = {}) {
  const dos = ['BIGPIC1.DAX', 'GEO1.DAX', 'ECL1.DAX', '8X8D1.DAX', 'KRYNN.CFG',
    'ECL2.DAX', 'SKY.DAX', 'PIC2.DAX', 'BIGPIC2.DAX', 'HEAD2.DAX', 'BODY2.DAX', 'MON2CHA.DAX',
    'GEO2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX', 'CPIC2.DAX', 'DUNGCOM.DAX'];
  const dosPaths = [...new Set([...dos, ...extraDosPaths])];
  const entries = dosPaths.map((relativePath) => ({ edition: 'DOS', rootEnv: 'GB_COK_DOS_INSTALL_DIR', relativePath,
    ...(relativePath === 'BIGPIC2.DAX' ? { sha256: manifest.dos.archiveSha256 }
      : extraDosPins[relativePath] ? { sha256: extraDosPins[relativePath] } : {}) }));
  entries.push({ edition: 'Amiga', rootEnv: 'GB_COK_AMIGA_INSTALL_DIR', relativePath: 'disk2/BIGPIC1.DAA',
    sha256: manifest.amiga.archiveSha256 });
  return readPinnedCokInstallFiles(entries);
}

/** Select the supplied real extracted install through Game Library, then open its CoK entry. */
export async function selectLocalCokInstall(page, files) {
  await page.evaluate(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined });
  });
  await page.click('#add-folder-btn');
  await page.waitForFunction('typeof document.querySelector("#folder-input")?.onchange === "function"');
  await page.evaluate((entries) => {
    const input = document.querySelector('#folder-input');
    if (!(input instanceof HTMLInputElement)) throw new Error('Game Library folder input is missing');
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], entry.name, { type: entry.type });
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.relativePath });
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
  await page.waitForFunction(() => window.__greybox?.getLibrary?.()
    .some((entry) => entry.kind === 'game' && entry.profileId === 'champions-of-krynn' && entry.platform === 'DOS'),
  { timeout: 45_000 });
  const index = await page.evaluate(() => window.__greybox.getLibrary().findIndex((entry) =>
    entry.kind === 'game' && entry.profileId === 'champions-of-krynn' && entry.platform === 'DOS'));
  assert.ok(index >= 0, 'Game Library did not recognize the selected DOS Champions of Krynn install');
  await page.click(`.lib-entry[data-lib-index="${index}"]`);
  return index;
}

/** Select a directory-backed local pack in the real UI using browser File objects. */
export async function selectLocalRestyleFiles(page, files, container = null) {
  const button = await page.$(`${container ? `${container} ` : ''}button[aria-label="Choose a local Restyle image folder"]`);
  if (container) assert.equal(await button?.evaluate((picker, selector) => !!picker.closest(selector), container), true,
    'Restyle picker must belong to the explicitly selected container');
  assert.ok(button, 'Local Restyle picker is available on this runtime surface');
  await button.evaluate((picker, entries) => {
    const input = picker.parentElement?.querySelector('input[type="file"][webkitdirectory]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Local Restyle directory input is missing');
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], entry.name, { type: entry.type });
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.relativePath });
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
  await button.dispose();
}

/** Clear through the selected surface's real button, never a synthetic pack event. */
export async function clearLocalRestyleFiles(page, container) {
  const button = await page.$(`${container} .gbx-local-pack-picker button:nth-of-type(2)`);
  assert.ok(button, 'Scoped local Restyle Clear button is present');
  await button.click();
  await button.dispose();
}

/** Hold real decoded bitmaps after decode, preserving admitted bytes; always restore in finally. */
export async function holdRestyleDecodes(page, dimensions) {
  await page.evaluate(([width, height]) => {
    const original = window.createImageBitmap;
    const jobs = []; let stopped = false;
    window.__heldDemoDecodes = { jobs, restore: () => { stopped = true; window.createImageBitmap = original; for (const job of jobs) { if (!job.settled) job.reject(); if (!job.closed) job.close(); } delete window.__heldDemoDecodes; } };
    window.createImageBitmap = async (...args) => {
      const bitmap = await original.apply(window, args);
      if (stopped) { bitmap.close(); throw new Error('Decode observer disposed'); }
      if (bitmap.width !== width || bitmap.height !== height) return bitmap;
      return new Promise((resolve, reject) => {
        const job = { id: jobs.length, settled: false, closed: false, release: () => { job.settled = true; resolve(bitmap); }, reject: () => {
          job.settled = true;
          bitmap.close(); reject(new Error('Delayed decode rejection control'));
        } };
        const close = bitmap.close.bind(bitmap);
        bitmap.close = () => { job.closed = true; close(); };
        job.close = () => bitmap.close(); jobs.push(job);
      });
    };
  }, dimensions);
  return {
    wait: (count) => page.waitForFunction((n) => window.__heldDemoDecodes.jobs.length === n, {}, count),
    release: (index, reject = false) => page.evaluate((i, fail) => {
      const job = window.__heldDemoDecodes.jobs[i];
      job[fail ? 'reject' : 'release']();
      return new Promise((done) => setTimeout(done, 0));
    }, index, reject),
    closed: (index) => page.evaluate((i) => window.__heldDemoDecodes.jobs[i].closed, index),
    restore: () => page.evaluate(() => window.__heldDemoDecodes.restore()),
  };
}

/** Observe callback identity, including actual unsubscribe, before mounting any demo. */
export async function observeDemoPackListeners(page) {
  await page.evaluate(() => {
    const add = window.addEventListener, remove = window.removeEventListener, active = new Set(), added = [], removed = [];
    window.addEventListener = function(type, callback, options) { if (type === 'goldbox:local-asset-pack') { active.add(callback); added.push(callback); } return add.call(this, type, callback, options); };
    window.removeEventListener = function(type, callback, options) { if (type === 'goldbox:local-asset-pack') { active.delete(callback); removed.push(callback); } return remove.call(this, type, callback, options); };
    window.__demoListeners = { active, added, removed, restore() { window.addEventListener = add; window.removeEventListener = remove; delete window.__demoListeners; delete window.__demoOldListeners; } };
  });
  return { restore: () => page.evaluate(() => window.__demoListeners?.restore()) };
}
