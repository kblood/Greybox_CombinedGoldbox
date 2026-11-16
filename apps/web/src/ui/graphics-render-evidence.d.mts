export type GraphicsRenderEvidence = {
  title: string;
  label: string;
  explanation: string;
  status: 'verified-stored-frame-decode' | 'hypothesis';
};
export function graphicsRenderEvidence(asset: {
  game?: string;
  platform?: string;
  archive?: { name?: string; sha256?: string | null };
  decoded?: { renderingTransform?: string } | null;
}): GraphicsRenderEvidence | null;
