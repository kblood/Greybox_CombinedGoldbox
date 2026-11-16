/**
 * Electron preload (M6.S1) — exposes a small typed `window.electronAPI` bridge via
 * `contextBridge`, the only surface the sandboxed renderer (apps/web's own bundle, unmodified
 * otherwise) can use to reach native filesystem access. Mirrors the shape
 * `apps/web/src/ui/library.ts` expects (see its `ElectronAPI` interface).
 */
import { contextBridge, ipcRenderer } from 'electron';
import { ELECTRON_E2E_ENABLED } from '../e2eGate';

interface PickedFolder {
  sourceId: string;
  folderName: string;
  entries: string[];
}

interface ElectronAPI {
  pickFolder(): Promise<PickedFolder | null>;
  readFile(sourceId: string, relPath: string, maxLength?: number): Promise<Uint8Array>;
  pickFolderForTest?: (testPath: string) => Promise<PickedFolder | null>;
}

const electronAPI: ElectronAPI = {
  pickFolder: (): Promise<PickedFolder | null> => ipcRenderer.invoke('goldbox:pickFolder'),
  readFile: (sourceId: string, relPath: string, maxLength?: number): Promise<Uint8Array> =>
    ipcRenderer.invoke('goldbox:readFile', sourceId, relPath, maxLength),
};

if (ELECTRON_E2E_ENABLED) {
  electronAPI.pickFolderForTest = (testPath: string): Promise<PickedFolder | null> =>
    ipcRenderer.invoke('goldbox:pickFolderForTest', testPath);
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
