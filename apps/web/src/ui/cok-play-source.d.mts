import type { AssetSource } from './assetSource.js';

export interface CokPlayInstallLike {
  kind: 'game';
  match: { profileId: string; platform: string };
  assetSource: AssetSource;
}

export type CokPlayInstallResolution<T extends CokPlayInstallLike> = {
  status: 'selected' | 'unique' | 'ambiguous' | 'missing';
  entry: T | null;
  count: number;
};

export function resolveCokPlayInstall<T extends CokPlayInstallLike>(
  entries: readonly (T | { kind: 'module' })[], selected?: T | null,
): CokPlayInstallResolution<T>;
