export interface ManifestItem {
  id: string;
  kind: string;
  stem: string;
  src: string;
  description?: string;
  label?: string;
  game?: string;
  native_w: number;
  native_h: number;
  k: number;
  /** Exact SHA-256 of orig/<stem>.png in the packaged manifest. */
  sourceSha256?: string;
  /** Exact SHA-256 of out/<stem>.png in the packaged manifest. */
  outputSha256?: string;
}
export interface RestyleManifest { batch: string; items: ManifestItem[] }
export interface RestyleFidelityResult {
  id: string;
  stem: string;
  verdict: 'ok' | 'FLAG';
  edge_corr: number;
  hist_dist: number;
  aspect_dev: number;
  size: [number, number];
  k?: number;
}
export const RESTYLE_GAMES: Readonly<Record<string, string>>;
export function groupRestyleItems(items: ManifestItem[]): { game: string; label: string; items: ManifestItem[] }[];
export const MAX_IMAGE_DIMENSION: number;
export const MAX_IMAGE_PIXELS: number;
export function validImageSize(width: number, height: number): boolean;
export function validateRestyleManifest(manifest: unknown): RestyleManifest;
export function validateRestyleFidelity(data: unknown, manifest: RestyleManifest): { results: RestyleFidelityResult[] };
export function selectRestyleItems(manifest: RestyleManifest, batch?: string | null): ManifestItem[];
