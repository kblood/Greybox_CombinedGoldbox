export interface IntroAssetSource {
  readAsset(basename: string): Promise<Uint8Array | null>;
  readPath?(relativePath: string): Promise<Uint8Array | null>;
}

export function loadIntroTitleBytes(options: {
  titlePath: string;
  assetRelativePaths?: string[];
  assetSource?: IntroAssetSource;
  developmentUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Uint8Array>;
