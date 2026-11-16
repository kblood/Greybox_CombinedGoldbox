import { resolve } from 'node:path';
import * as ts from 'typescript';

const PRIVATE_ROOT = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users\/[^/]+|home\/[^/]+|private\/var\/folders\/[^/]+|var\/folders\/[^/]+|mnt\/[^/]+|Volumes\/[^/]+)(?:\/|$))/i;
const EMBEDDED_PRIVATE_PATH = /(?<![A-Za-z0-9+./-])(?:[a-z]:[\\/]|\\\\)[^;'"<>]*?\.[a-z0-9]{1,6}(?:#[^\s;'"<>]*)?/gi;
const EMBEDDED_POSIX_PRIVATE_PATH = /(?<![A-Za-z0-9_.:\/-])\/(?:Users\/[^/;'"<>]+|home\/[^/;'"<>]+|private\/var\/folders\/[^/;'"<>]+|var\/folders\/[^/;'"<>]+|mnt\/[^/;'"<>]+|Volumes\/[^/;'"<>]+)(?:\/[^;'"<>]*)*?\.[a-z0-9]{1,6}(?:#[^\s;'"<>]*)?/gi;
const INPUTS = [
  'docs/engine/research/cok-graphics-identity-registry-v1.json',
  'docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json',
  'docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json',
  'docs/engine/research/cok-graphics-alias-bindings-v1.json',
  'docs/engine/research/cok-runtime-art-coverage-v2.json',
  'docs/engine/research/cok-runtime-art-combat-sites-v2.json',
  'docs/engine/research/cok-graphics-source-census-v1.json',
  'docs/engine/research/dok-graphics-identity-registry-v1.json',
  'docs/engine/research/dok-graphics-source-roster-v1.json',
  'docs/engine/research/dok-graphics-source-census-v1.json',
  'docs/engine/research/dok-dos-exact-pixel-visual-descriptions-v1.json',
  'docs/engine/research/dok-dos-registry-pixel-visual-descriptions-v1.json',
  'docs/engine/research/cok-graphics-frame-hypotheses-v1.json',
];
const RUNTIME_PATH_MODULES = [
  'apps/web/src/ui/gameData.ts',
  'apps/web/src/ui/combat.ts',
  'apps/web/src/ui/catalog.ts',
  'apps/web/src/audio/gameAudio.ts',
];

function publicPath(value) {
  if (!PRIVATE_ROOT.test(value)) return value;
  const normalized = value.replace(/\\/g, '/');
  const fragmentAt = normalized.indexOf('#');
  const filePath = fragmentAt < 0 ? normalized : normalized.slice(0, fragmentAt);
  const fragment = fragmentAt < 0 ? '' : normalized.slice(fragmentAt);
  const segments = filePath.split('/').filter(Boolean);
  // Keep the archive/image basename and any locator fragment (for example
  // `CPIC1.DAX#57/frame/0`); hashes and explicit locators carry identity.
  return `${segments.at(-1) ?? 'local-source'}${fragment}`;
}

export function projectPublicGraphicsMetadata(value) {
  if (typeof value === 'string') return PRIVATE_ROOT.test(value)
    ? publicPath(value) : value.replace(EMBEDDED_PRIVATE_PATH, publicPath).replace(EMBEDDED_POSIX_PRIVATE_PATH, publicPath);
  if (Array.isArray(value)) return value.map(projectPublicGraphicsMetadata);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, projectPublicGraphicsMetadata(child)]));
  }
  return value;
}

export function publicGraphicsMetadataPlugin(repoRoot) {
  const targets = new Set(INPUTS.map((path) => resolve(repoRoot, path).toLowerCase()));
  const runtimePathTargets = new Set(RUNTIME_PATH_MODULES.map((path) => resolve(repoRoot, path).toLowerCase()));
  return {
    name: 'goldbox-public-graphics-metadata',
    enforce: 'pre',
    transform(source, id) {
      const file = id.split('?')[0];
      const normalizedFile = resolve(file).toLowerCase();
      if (runtimePathTargets.has(normalizedFile)) {
        return { code: projectPublicRuntimePaths(source), map: null };
      }
      if (!targets.has(normalizedFile)) return null;
      const projected = projectPublicGraphicsMetadata(JSON.parse(source));
      // Vite parses .json ids as JSON; returning a JS module here fails that transform.
      return { code: JSON.stringify(projected), map: null };
    },
  };
}

export function projectPublicRuntimePaths(source) {
  const file = ts.createSourceFile('public-runtime-paths.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const replacements = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) && PRIVATE_ROOT.test(node.text)) {
      const raw = source.slice(node.getStart(file), node.getEnd());
      const quote = raw[0] === '`' ? "'" : raw[0];
      const body = JSON.stringify(publicPath(node.text)).slice(1, -1)
        .replaceAll("'", "\\'");
      replacements.push({ start: node.getStart(file), end: node.getEnd(), value: `${quote}${body}${quote}` });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  let projected = source;
  for (const replacement of replacements.reverse()) {
    projected = projected.slice(0, replacement.start) + replacement.value + projected.slice(replacement.end);
  }
  return projected;
}
