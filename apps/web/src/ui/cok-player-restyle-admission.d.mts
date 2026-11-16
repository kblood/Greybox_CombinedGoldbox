export type CokPlayerRestyleAdmission = Readonly<{ state: 'admitted' | 'not-admitted'; reason: string }>;
export interface CokPlayerPackageEntry {
  file: string;
  sha256: string;
  width: number;
  height: number;
  colorType: 2 | 6;
  dest: string;
}
export function cokPlayerFrameRestyleAdmission(
  manifest: any,
  policy: any,
  appearanceId: string,
  frameIndex: number,
): CokPlayerRestyleAdmission;
export function cokPlayerAppearancePackagePlan(manifest: any, policy: any): CokPlayerPackageEntry[];
export function cokPlayerAppearanceHeldRestylePaths(manifest: any, policy: any): string[];
