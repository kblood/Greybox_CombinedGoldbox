/**
 * Bundled-games catalog — representative assets across all three formats/games,
 * referenced by their REAL repo-relative locations. In `npm run dev` these are
 * fetched straight from the repo via Vite's `/@fs/<abs-path>` mechanism (the dev
 * server is configured with `server.fs.allow: ['..']`, see vite.config.ts).
 *
 * Paths are normally repo-root-relative (the repo root is the parent of
 * web-engine/). Local external archives may use absolute paths, such as the
 * user-provided NWN extraction under D:\Games. The viewer resolves both forms
 * to `/@fs/<absolute>` in dev. Casing matters on case-sensitive servers.
 */

export interface CatalogAsset {
  /** Stable id used in the `?asset=` query and the catalog UI. */
  id: string;
  /** Display label. */
  label: string;
  /** Repo-root-relative path, or an absolute local path, to the real game file. */
  path: string;
  /** Filename hint passed to decodeAsset (diagnostics only). */
  hint: string;
  /**
   * Decoder to use, when the bytes cannot be sniffed. Omitted for every container format —
   * those carry a magic (or, for DAX, a structural signature) and go through `decodeAsset`.
   *
   * `c64-picture` exists because the C64 `PIC*` family has no magic at all: `isC64Picture` is a
   * bare length check for 2681 or 2682 bytes, so putting it in the generic dispatcher would let
   * it claim any unrelated file of that size. The catalog names the decoder instead of asking
   * the bytes.
   *
   * `dqk-save` is here for a different reason: a `.QSV` is not a picture at all. The whole DQK
   * save family decoded and passed its tests for weeks with no caller anywhere in `apps/`, which
   * `tools/sweep_engine_reach.py` reports as `./loaders/dqkSave.js` unreached. This is the caller.
   */
  kind?: 'c64-picture' | 'dqk-save';
  /**
   * Companion file this asset needs to render. A C64 picture only ships glyphs $40..$FF; codes
   * $00..$3F live in a separate 514-byte `CHARSET` PRG staged at $D000.
   *
   * How much it is worth varies enormously by title, and not the way cell counts suggest -- see
   * `packages/engine/test/c64-picture.test.ts` tier 3, which measures it. Gateway's pictures owe
   * it 14,848 pixels (40.7%, code $1C in a fixed 232-cell layout shared by all three); Champions'
   * PIC70 and Death Knights' PIC71 owe it literally nothing, because their low-code cells are all
   * $20, whose glyph is blank. Fetching it is still mandatory: a missing companion must fail
   * loudly rather than render a Gateway picture missing 40% of itself.
   */
  companionPath?: string;
}

export interface CatalogGame {
  id: string;
  title: string;
  platform: string;
  format: string;
  assets: CatalogAsset[];
}

export const CATALOG: CatalogGame[] = [
  {
    id: 'nwn-dos',
    title: 'Neverwinter Nights (DOS/AOL)',
    platform: 'DOS',
    format: 'DAX (EGA-16)',
    assets: [
      { id: 'nwn-title', label: 'TITLE.DAX', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/TITLE.DAX', hint: 'TITLE.DAX' },
      { id: 'nwn-pic', label: 'PIC.DAX (animated scenes)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/PIC.DAX', hint: 'PIC.DAX' },
      { id: 'nwn-cpic', label: 'CPIC.DAX (combat portraits)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/CPIC.DAX', hint: 'CPIC.DAX' },
      { id: 'nwn-sprit', label: 'SPRIT.DAX (creature sprites)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/SPRIT.DAX', hint: 'SPRIT.DAX' },
      { id: 'nwn-8x8d', label: '8X8D.DAX (wall/tile art)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX', hint: '8X8D.DAX' },
      { id: 'nwn-back', label: 'BACK.DAX (backdrops)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/BACK.DAX', hint: 'BACK.DAX' },
      { id: 'nwn-chead', label: 'CHEAD.DAX (character heads)', path: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/CHEAD.DAX', hint: 'CHEAD.DAX' },
    ],
  },
  {
    id: 'dqk-dos',
    title: 'The Dark Queen of Krynn',
    platform: 'DOS',
    format: 'HLIB (.TLB)',
    assets: [
      { id: 'dqk-title', label: 'TITLE.TLB', path: 'The Dark Queen of Krynn/DISK1/TITLE.TLB', hint: 'TITLE.TLB' },
      { id: 'dqk-bigpic', label: 'BIGPIC.TLB', path: 'The Dark Queen of Krynn/DISK2/BIGPIC.TLB', hint: 'BIGPIC.TLB' },
      { id: 'dqk-cpic', label: 'CPIC.TLB (target, 190 slots ← Amiga CPIC1.DAA mismatch)', path: 'The Dark Queen of Krynn/DISK2/CPIC.TLB', hint: 'CPIC.TLB' },
      { id: 'dqk-8x8db', label: '8X8DB.TLB (target, 423 slots ← Amiga 8X8D1.DAA mismatch)', path: 'The Dark Queen of Krynn/DISK2/8X8DB.TLB', hint: '8X8DB.TLB' },
      { id: 'dqk-always', label: 'ALWAYS.TLB', path: 'The Dark Queen of Krynn/DISK1/ALWAYS.TLB', hint: 'ALWAYS.TLB' },
      // M8.S2 — DQK target slots for the shape-mismatch Amiga sources M8.S1 made browsable.
      // Each label states the mismatch explicitly (M8.S2's "Done" bar): a human flips between
      // this DQK target tab and its Amiga source tab (M8.S1's cok-amiga-* entries) in the
      // existing generic viewer — no new comparison renderer needed (least redundant surface).
      { id: 'dqk-pica', label: 'PICA.TLB (target, 37 slots ← Amiga pic1.daa: 27 base×50 frames)', path: 'The Dark Queen of Krynn/DISK2/PICA.TLB', hint: 'PICA.TLB' },
      { id: 'dqk-picb', label: 'PICB.TLB (target, 36 slots ← Amiga pic1.daa: 27 base×50 frames)', path: 'The Dark Queen of Krynn/DISK2/PICB.TLB', hint: 'PICB.TLB' },
      { id: 'dqk-picc', label: 'PICC.TLB (target, 47 slots ← Amiga pic1.daa: 27 base×50 frames)', path: 'The Dark Queen of Krynn/DISK2/PICC.TLB', hint: 'PICC.TLB' },
      { id: 'dqk-sprit', label: 'SPRIT.TLB (target, 96 slots ← Amiga SPRIT1.DAA: 17 base×51 frames)', path: 'The Dark Queen of Krynn/DISK2/SPRIT.TLB', hint: 'SPRIT.TLB' },
      { id: 'dqk-cbody', label: 'CBODY.TLB (target, 98 slots ← Amiga BODY1.DAA: 1 frame)', path: 'The Dark Queen of Krynn/DISK3/CBODY.TLB', hint: 'CBODY.TLB' },
      { id: 'dqk-wildcom', label: 'WILDCOM.TLB (target, 160 slots ← Amiga WILDCOM.DAA: 1 frame)', path: 'The Dark Queen of Krynn/DISK2/WILDCOM.TLB', hint: 'WILDCOM.TLB' },
      { id: 'dqk-dungcom', label: 'DUNGCOM.TLB (target, 136 slots ← Amiga DUNGCOM.DAA: 1 frame)', path: 'The Dark Queen of Krynn/DISK2/DUNGCOM.TLB', hint: 'DUNGCOM.TLB' },
      { id: 'dqk-8x8dc', label: '8X8DC.TLB (target, 376 slots ← Amiga 8X8D1.DAA: 12 frames)', path: 'The Dark Queen of Krynn/DISK2/8X8DC.TLB', hint: '8X8DC.TLB' },
      // The only two DQK containers whose members are not all plain images: FRAME.TLB carries
      // 3 method-25 composites (and is the file whose ptr-21 record holds the single nonzero
      // dest_x in the whole corpus), TOPVIEW.TLB the one member region the walk still refuses.
      // Both are here so the viewer's composite assembly and its undecoded-bytes note are
      // reachable by a human, not only by a unit test.
      { id: 'dqk-frame', label: 'FRAME.TLB (40 images + 3 method-25 composites)', path: 'The Dark Queen of Krynn/DISK3/FRAME.TLB', hint: 'FRAME.TLB' },
      { id: 'dqk-topview', label: 'TOPVIEW.TLB (20 images; leading member = empty colour table)', path: 'The Dark Queen of Krynn/DISK2/TOPVIEW.TLB', hint: 'TOPVIEW.TLB' },
      // Not artwork. The `.QSV` save decoder has been correct and tested for weeks with no caller
      // in `apps/` at all; this entry is what makes it reachable by a human. The record stride was
      // solved on 2026-08-24 (`docs/engine/research/dqk-save-format.md` §5), so the view now walks
      // the roster arithmetically AND scans for it, and reports whether the two agree instead of
      // trusting either alone. The header's party-size byte is shown next to the record count;
      // one shipped save in the corpus disagrees with it.
      ...(!import.meta.env.PROD ? [
        { id: 'dqk-savgama', label: 'SAVGAMA.QSV (save game: party roster, scanned)', path: 'The Dark Queen of Krynn/SAVGAMA.QSV', hint: 'SAVGAMA.QSV', kind: 'dqk-save' as const },
      ] : []), // Public builds never ship saves; the import route accepts a local Library source.
    ],
  },
  {
    id: 'cok-dos',
    title: 'Champions of Krynn',
    platform: 'DOS',
    format: 'DAX (EGA-16)',
    assets: [
      { id: 'cok-bigpic1', label: 'BIGPIC1.DAX', path: 'Champions of Krynn/BIGPIC1.DAX', hint: 'BIGPIC1.DAX' },
      { id: 'cok-chead', label: 'CHEAD.DAX', path: 'Champions of Krynn/CHEAD.DAX', hint: 'CHEAD.DAX' },
      { id: 'cok-title', label: 'TITLE.DAX', path: 'Champions of Krynn/TITLE.DAX', hint: 'TITLE.DAX' },
      { id: 'cok-comspr', label: 'COMSPR.DAX', path: 'Champions of Krynn/COMSPR.DAX', hint: 'COMSPR.DAX' },
      { id: 'cok-sprit1', label: 'SPRIT1.DAX (monster sprites)', path: 'Champions of Krynn/SPRIT1.DAX', hint: 'SPRIT1.DAX' },
      { id: 'cok-pic1', label: 'PIC1.DAX (animated portraits)', path: 'Champions of Krynn/PIC1.DAX', hint: 'PIC1.DAX' },
      { id: 'cok-8x8d1', label: '8X8D1.DAX (tile banks + block 201 text font)', path: 'Champions of Krynn/8X8D1.DAX', hint: '8X8D1.DAX' },
    ],
  },
  {
    // C64 `PIC*` full-screen pictures — 304x120 (38x15 character cells), the C64 counterpart of
    // the DOS `BIGPIC*.DAX` frames. `decodeC64Picture` has been golden-tested against
    // `tools/c64_pic.py` since the C64 arc, and until 2026-08-23 nothing in the web app referenced
    // C64 at all: the engine could render these and no user could see one.
    //
    // The bytes live inside `.d64` images, and the `.d64` reader is deliberately NOT in `src/`
    // (see the note at the top of packages/engine/test/c64-picture.test.ts). Rather than reverse
    // that decision, these are pre-extracted with `tools/c64_disk.py --extract` into the
    // git-ignored `c64_extracted/`, exactly as `amiga_extracted/` works for the ADF material.
    id: 'c64-pictures',
    title: 'C64 full-screen pictures (Champions · Death Knights · Gateway)',
    platform: 'C64',
    format: 'PRG (VIC-II, 304x120)',
    assets: [
      { id: 'c64-cok-pic70', label: 'CoK PIC70', path: 'c64_extracted/cok/PIC70.PRG', hint: 'PIC70', kind: 'c64-picture', companionPath: 'c64_extracted/cok/CHARSET.PRG' },
      { id: 'c64-cok-pic72', label: 'CoK PIC72', path: 'c64_extracted/cok/PIC72.PRG', hint: 'PIC72', kind: 'c64-picture', companionPath: 'c64_extracted/cok/CHARSET.PRG' },
      { id: 'c64-cok-pic79', label: 'CoK PIC79', path: 'c64_extracted/cok/PIC79.PRG', hint: 'PIC79', kind: 'c64-picture', companionPath: 'c64_extracted/cok/CHARSET.PRG' },
      { id: 'c64-dok-pic71', label: 'DoK PIC71', path: 'c64_extracted/dok/PIC71.PRG', hint: 'PIC71', kind: 'c64-picture', companionPath: 'c64_extracted/dok/CHARSET.PRG' },
      { id: 'c64-gateway-pic7c', label: 'Gateway PIC7C', path: 'c64_extracted/gateway/PIC7C.PRG', hint: 'PIC7C', kind: 'c64-picture', companionPath: 'c64_extracted/gateway/CHARSET.PRG' },
      { id: 'c64-gateway-pic7e', label: 'Gateway PIC7E', path: 'c64_extracted/gateway/PIC7E.PRG', hint: 'PIC7E', kind: 'c64-picture', companionPath: 'c64_extracted/gateway/CHARSET.PRG' },
    ],
  },
  {
    // GLIB — the big-endian Amiga sibling of HLIB, used by every Amiga Gold Box title from
    // Curse onward. `decodeGlib` has decoded these since 2026-07-18 (152 files across six
    // titles, 13,884 images) but the generic `decodeAsset` dispatcher did not sniff the magic
    // until 2026-08-22, so this viewer answered "unrecognized container format" for all of
    // them and the catalog had no GLIB group to put them in. These three are already bundled
    // for the Amiga wall-art graphics switch, so listing them costs no extra payload.
    id: 'amiga-glib',
    title: 'Amiga GLIB containers (Gateway · Pools of Darkness)',
    platform: 'Amiga',
    format: 'GLIB (.TLB)',
    assets: [
      { id: 'gateway-amiga-walls', label: 'Walls.tlb (Gateway, wall art)', path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Walls.tlb', hint: 'Walls.tlb' },
      { id: 'gateway-amiga-always', label: 'Always.tlb (Gateway, palette source)', path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Always.tlb', hint: 'Always.tlb' },
      { id: 'pools-amiga-8x8d', label: '8X8D.TLB (Pools of Darkness, 8x8 tiles)', path: 'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/8X8D.TLB', hint: '8X8D.TLB' },
    ],
  },
  {
    id: 'cok-amiga',
    title: 'Champions of Krynn',
    platform: 'Amiga',
    format: 'DAA (12-bit) / IFF (.LBM)',
    assets: [
      { id: 'cok-amiga-bigpic1', label: 'BIGPIC1.DAA', path: 'amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA', hint: 'BIGPIC1.DAA' },
      { id: 'cok-amiga-cpic1', label: 'CPIC1.DAA', path: 'amiga_extracted/ChampionsOfKrynn/disk2/CPIC1.DAA', hint: 'CPIC1.DAA' },
      { id: 'cok-amiga-scrn1b', label: 'scrn1b.lbm', path: 'amiga_extracted/ChampionsOfKrynn/disk1/scrn1b.lbm', hint: 'scrn1b.lbm' },
      { id: 'cok-amiga-scrn2', label: 'scrn2.lbm', path: 'amiga_extracted/ChampionsOfKrynn/disk1/scrn2.lbm', hint: 'scrn2.lbm' },
      { id: 'cok-amiga-sprit1', label: 'SPRIT1.DAA', path: 'amiga_extracted/ChampionsOfKrynn/disk2/SPRIT1.DAA', hint: 'SPRIT1.DAA' },
      // M8.S1 — the remaining `shape-mismatch` sources from DQK_ART_LAYOUT (dqkArtMap.ts):
      // decoded frames exist but weren't reachable in the viewer sidebar. All five decode via
      // the same generic DAA frame-grid path already used above (no new renderer needed).
      { id: 'cok-amiga-pic1', label: 'pic1.daa (PICA/B/C source)', path: 'amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa', hint: 'pic1.daa' },
      { id: 'cok-amiga-body1', label: 'BODY1.DAA (CBODY source)', path: 'amiga_extracted/ChampionsOfKrynn/disk2/BODY1.DAA', hint: 'BODY1.DAA' },
      { id: 'cok-amiga-wildcom', label: 'WILDCOM.DAA (WILDCOM source)', path: 'amiga_extracted/ChampionsOfKrynn/disk2/WILDCOM.DAA', hint: 'WILDCOM.DAA' },
      { id: 'cok-amiga-dungcom', label: 'DUNGCOM.DAA (DUNGCOM source)', path: 'amiga_extracted/ChampionsOfKrynn/disk2/DUNGCOM.DAA', hint: 'DUNGCOM.DAA' },
      { id: 'cok-amiga-8x8d1', label: '8X8D1.DAA (8X8DB/C source)', path: 'amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA', hint: '8X8D1.DAA' },
    ],
  },
  {
    id: 'dok-dos',
    title: 'Death Knights of Krynn',
    platform: 'DOS',
    format: 'DAX (EGA-16)',
    assets: [
      { id: 'dok-bigpic1', label: 'BIGPIC1.DAX', path: 'Death Knights of Krynn/BIGPIC1.DAX', hint: 'BIGPIC1.DAX' },
      { id: 'dok-title', label: 'TITLE.DAX', path: 'Death Knights of Krynn/TITLE.DAX', hint: 'TITLE.DAX' },
      { id: 'dok-chead', label: 'CHEAD.DAX', path: 'Death Knights of Krynn/CHEAD.DAX', hint: 'CHEAD.DAX' },
    ],
  },
  {
    id: 'dok-amiga',
    title: 'Death Knights of Krynn',
    platform: 'Amiga',
    format: 'DAA (12-bit) / IFF (.LBM)',
    assets: [
      { id: 'dok-amiga-bigpic1', label: 'BIGPIC1.DAA', path: 'amiga_extracted/DeathKnightsOfKrynn/disk1/BIGPIC1.DAA', hint: 'BIGPIC1.DAA' },
      { id: 'dok-amiga-cpic1', label: 'CPIC1.daa', path: 'amiga_extracted/DeathKnightsOfKrynn/disk1/CPIC1.daa', hint: 'CPIC1.daa' },
      { id: 'dok-amiga-title1', label: 'Title1.LBM', path: 'amiga_extracted/DeathKnightsOfKrynn/disk1/Title1.LBM', hint: 'Title1.LBM' },
    ],
  },
];

/** Flat lookup of every catalog asset by id. */
export const CATALOG_BY_ID: Map<string, CatalogAsset> = new Map(
  CATALOG.flatMap((g) => g.assets.map((a) => [a.id, a] as const)),
);

/**
 * The repo root is one level above web-engine/. At dev time Vite serves any file
 * under `server.fs.allow` via `/@fs/<absolute-path>`. We compute the absolute repo
 * root from the dev server's CWD-independent marker injected by Vite define, with a
 * fallback to a relative `../` fetch (which also works because index.html lives in
 * web-engine/ and the dev root is web-engine/).
 */
declare const __REPO_ROOT__: string;

// In a production (static) build, the referenced game files and manifests are
// copied next to index.html by scripts/bundle-assets.mjs — assets under
// ./assets/<repo-rel-path> and manifests under ./games/<id>.json — and fetched
// with URLs relative to the deployed base (e.g. /goldbox/). At dev time we
// instead read the real repo files directly via Vite's /@fs mechanism.
const PROD: boolean = Boolean((import.meta as { env?: { PROD?: boolean } }).env?.PROD);
// import.meta.env.BASE_URL honours vite `base` ('./' here) — append our subdir.
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';

function isAbsoluteFsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/');
}

function encodeFsPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/');
}

function sanitizeExternalSegment(segment: string): string {
  const cleaned = segment
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : '_';
}

function externalAssetPathFor(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const winDrive = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (winDrive) {
    const [, drive, rest] = winDrive;
    const segments = rest.split('/').filter(Boolean).map(sanitizeExternalSegment);
    return ['external', 'win', drive.toUpperCase(), ...segments].join('/');
  }
  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean).map(sanitizeExternalSegment);
  return ['external', 'posix', ...segments].join('/');
}

/**
 * Build a fetchable URL for a per-game manifest in web-engine/games/. The dev
 * root is web-engine/, so the manifest is served directly at /games/<id>.json;
 * a production build serves the copied manifest at <base>games/<id>.json.
 */
export function manifestUrl(id: string): string {
  if (PROD) return `${BASE}games/${encodeURIComponent(id)}.json`;
  return `/games/${encodeURIComponent(id)}.json`;
}

/** Build a fetchable URL for a repo-root-relative path. */
export function assetUrl(repoRelPath: string): string {
  if (isAbsoluteFsPath(repoRelPath)) {
    if (PROD) return `${BASE}assets/${externalAssetPathFor(repoRelPath).split('/').map(encodeURIComponent).join('/')}`;
    return `/@goldbox-local/${encodeFsPath(repoRelPath)}`;
  }
  // URL-encode each path segment (spaces, etc.) but keep the slashes.
  const encoded = repoRelPath.split('/').map(encodeURIComponent).join('/');
  // Production: the file was copied to <base>assets/<repo-rel-path>.
  if (PROD) return `${BASE}assets/${encoded}`;
  let root = '';
  try {
    root = __REPO_ROOT__;
  } catch {
    root = '';
  }
  if (root) {
    // Normalize backslashes to forward slashes and encode each segment, but keep
    // a leading drive letter ("C:") intact — Vite's /@fs wants `C:/...`, and
    // encoding the colon to %3A breaks the lookup.
    const encRoot = root
      .replace(/\\/g, '/')
      .split('/')
      .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
      .join('/');
    return `/@fs/${encRoot}/${encoded}`;
  }
  // Fallback: relative to web-engine/ dev root.
  return `../${encoded}`;
}
