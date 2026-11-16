export interface GameFolderBackend {
  load(game: string): Promise<FileSystemDirectoryHandle | undefined>;
  save(game: string, handle: FileSystemDirectoryHandle): Promise<void>;
  remove(game: string): Promise<void>;
}

export type FolderPermission = 'granted' | 'prompt' | 'denied' | 'unavailable';

/** The IndexedDB backend, or `null` when this browser has no IndexedDB. */
export function indexedDbGameFolderBackend(): GameFolderBackend | null;
/** An in-memory backend with the same contract (tests, or browsers without IndexedDB). */
export function memoryGameFolderBackend(): GameFolderBackend & { size(): number };
/** True when the browser can pick a directory handle that could be remembered. */
export function folderMemorySupported(): boolean;
/** Re-check read permission for a remembered handle without prompting. */
export function queryFolderPermission(handle: FileSystemDirectoryHandle): Promise<FolderPermission>;
/** Ask for read permission. Must run from a user gesture to show a prompt. */
export function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<FolderPermission>;
