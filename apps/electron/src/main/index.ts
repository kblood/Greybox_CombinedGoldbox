/**
 * Electron main process (M6.S1) — the desktop shell's shell-specific half of the
 * `AssetSource` seam (ARCHITECTURE.md §2.1, §4 step 2): "renderer points at apps/web build."
 * The renderer IS the apps/web production bundle (`apps/web/dist-app/`), loaded unmodified —
 * no separate desktop UI to keep in sync. What's genuinely new here is native filesystem asset
 * access: a real folder picker (`dialog.showOpenDialog`) + `fs.readdir`/`fs.readFile` over IPC,
 * replacing the browser's File System Access API, which `apps/web/src/ui/library.ts` calls
 * through a small `window.electronAPI` bridge (see `../preload/index.ts`) when present.
 *
 * Every successful folder selection returns an opaque, renderer-owned source capability. Reads
 * name that capability and are rejected if their lexical or canonical path escapes its retained
 * root — the same boundary a browser sandbox gives the web shell for free. Selecting another
 * folder therefore cannot retarget an existing Library entry.
 */
import { app, BrowserWindow, ipcMain, dialog, type WebContents } from 'electron';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ELECTRON_E2E_ENABLED } from '../e2eGate';

// In dev, point the window at the apps/web Vite dev server instead of a static build so the
// desktop shell can be iterated on without a rebuild. Unset in production.
const DEV_SERVER_URL = process.env.GOLDBOX_ELECTRON_DEV_URL;
// Unpacked (source tree, `npm start`): apps/web/dist-app sits three levels up from
// apps/electron/dist/main/. Packaged (electron-builder, M6.S2): electron-builder.json's
// `extraResources` copies that same dist-app into resources/web-dist-app instead, since the
// source tree's relative layout no longer exists inside the packaged app.
const WEB_DIST_INDEX = app.isPackaged
  ? join(process.resourcesPath, 'web-dist-app', 'index.html')
  : resolve(__dirname, '..', '..', '..', 'web', 'dist-app', 'index.html');
// Unpackaged, explicitly enabled acceptance may read a complete external candidate package.
const RENDERER_INDEX = !app.isPackaged && ELECTRON_E2E_ENABLED && process.env.GOLDBOX_ELECTRON_E2E_RENDERER_ROOT
  ? resolve(process.env.GOLDBOX_ELECTRON_E2E_RENDERER_ROOT, 'index.html') : WEB_DIST_INDEX;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Greybox',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(RENDERER_INDEX);
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- electronAssetSource: native folder picker + path-validated file reads -------------------

const MAX_SCAN_FILES = 4096; // mirrors apps/web/src/ui/library.ts's own cap.

interface RetainedSource {
  root: string;
  ownerId: number;
  entries: Set<string>;
}

const retainedSources = new Map<string, RetainedSource>();
const observedOwners = new Set<number>();

async function walk(dir: string, prefix: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) return;
    if (entry.isSymbolicLink()) continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(join(dir, entry.name), relPath, out);
    } else if (entry.isFile()) {
      out.push(relPath);
    }
  }
}

interface PickedFolder {
  sourceId: string;
  folderName: string;
  entries: string[];
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function retainSource(root: string, entries: string[], owner: WebContents): string {
  const ownerId = owner.id;
  const sourceId = randomUUID();
  retainedSources.set(sourceId, { root, ownerId, entries: new Set(entries.map(normalizeRelativePath)) });
  if (!observedOwners.has(ownerId)) {
    observedOwners.add(ownerId);
    owner.once('destroyed', () => {
      observedOwners.delete(ownerId);
      for (const [id, source] of retainedSources) {
        if (source.ownerId === ownerId) retainedSources.delete(id);
      }
    });
  }
  return sourceId;
}

async function scanRoot(root: string, owner: WebContents): Promise<PickedFolder> {
  const canonicalRoot = await realpath(root);
  const entries: string[] = [];
  await walk(canonicalRoot, '', entries);
  return {
    sourceId: retainSource(canonicalRoot, entries, owner),
    folderName: canonicalRoot.split(/[\\/]/).pop() ?? canonicalRoot,
    entries,
  };
}

async function assertInsideRoot(sourceId: string, ownerId: number, relPath: string): Promise<string> {
  const source = retainedSources.get(sourceId);
  if (!source || source.ownerId !== ownerId) throw new Error('unknown or unauthorized asset source');
  const abs = resolve(source.root, relPath);
  const rel = relative(source.root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`path escapes picked root: ${relPath}`);
  }
  if (!source.entries.has(normalizeRelativePath(relPath))) {
    throw new Error(`path was not present in selected folder: ${relPath}`);
  }
  const canonical = await realpath(abs);
  const canonicalRel = relative(source.root, canonical);
  if (canonicalRel === '..' || canonicalRel.startsWith(`..${sep}`) || isAbsolute(canonicalRel)) {
    throw new Error(`canonical path escapes picked root: ${relPath}`);
  }
  return canonical;
}

ipcMain.handle('goldbox:pickFolder', async (event): Promise<PickedFolder | null> => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner) return null;
  const res = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return null;
  return scanRoot(res.filePaths[0], event.sender);
});

// Headless e2e seam: bypass the native (unautomatable) dialog and scan a fixed path directly —
// the desktop analog of apps/web's `window.__greybox.addFromEntries`. It is not registered in a
// normal development or packaged launch: a renderer may nominate an arbitrary path only when the
// owning test process explicitly enables this capability.
if (ELECTRON_E2E_ENABLED) {
  ipcMain.handle('goldbox:pickFolderForTest', async (event, testPath: string): Promise<PickedFolder | null> => {
    if (!existsSync(testPath)) return null;
    return scanRoot(testPath, event.sender);
  });
}

ipcMain.handle('goldbox:readFile', async (event, sourceId: string, relPath: string, maxLength?: number): Promise<Uint8Array> => {
  const abs = await assertInsideRoot(sourceId, event.sender.id, relPath);
  if (maxLength !== undefined && (!Number.isSafeInteger(maxLength) || maxLength < 0)) {
    throw new Error('maxLength must be a non-negative safe integer');
  }
  const buf = await readFile(abs);
  return new Uint8Array(maxLength === undefined ? buf : buf.subarray(0, maxLength));
});
