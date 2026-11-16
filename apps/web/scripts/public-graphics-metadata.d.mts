export function projectPublicGraphicsMetadata<T>(value: T): T;
export function publicGraphicsMetadataPlugin(repoRoot: string): {
  name: string;
  enforce: 'pre';
  transform(source: string, id: string): { code: string; map: null } | null;
};
