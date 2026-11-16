import type { IndexedImage } from '@goldbox/engine';
type Block = { blockId: number; index: number; raw: Uint8Array };
type Locator = { kind: string; blockId: number | null; entryIndex?: number | null; frameIndex?: number | null;
  tileIndex?: number | null; cellIndex?: number | null; glyphIndex?: number | null };
export function dokStoredDaxLayout(name: string, entryIndex: number, blockId: number): {
  profile: string; kind: string; field: string; suffix: string; limit: number; count?: number; dim?: number;
} | null;
export function selectStoredDaxChild(name: string, blocks: Block[], locator: Locator):
  { width: number; height: number; packed: Uint8Array; xOffset: number; yOffset: number } | null;
export function verifyStoredDaxChild(name: string, blocks: Block[], locator: Locator, contentSha256: string | undefined,
  pixelSha256: string | undefined, palette: NonNullable<IndexedImage['palette']>): Promise<IndexedImage | null>;
