/**
 * E4.2b executor — materialize a bootable CoK/DoK-on-DQK game directory from a build plan.
 *
 * This is the thin filesystem driver around the engine's pure {@link planDqkBuild}: it reads a Gen1
 * game's `GEO{n}.DAX` + `MON{n}CHA.DAX` + `ECL{n}.DAX`, assembles them into the DQK Gen2 container
 * set (E4.1), plans the full disk directory + retitled `DQK.EXE` + DOSBox conf (E4.2a/E4.2b-1), then
 * writes `emit` bytes and copies `copy` files verbatim from a source DQK release. The output is a
 * real directory you can point DOSBox at (the manual E4.2b-2 boot check).
 *
 * Usage (run with tsx; nothing is committed — the output dir is local only):
 *   npx tsx tools/build-dqk-dir.mts \
 *     --dqk "The Dark Queen of Krynn"  --src "Champions of Krynn"  --n 1 \
 *     --target cok  --out build/cok-on-dqk
 *
 *   --dqk    path to a DQK release (provides DQK.EXE + the art/audio/engine passthrough disks)
 *   --src    path to the CoK/DoK release (provides GEO{n}/MON{n}CHA/ECL{n}.DAX)
 *   --n      DAX archive index — when given, builds ONLY that one disk's area set (the M1 single-area
 *            slice). Omit it (the default) to MERGE every present disk (GEO1..3 + ECL1..3 + MON1..3CHA)
 *            into the unified GLBs by area id (M3.1 — the complete game). `--n all` is the explicit
 *            multi-disk form.
 *   --target cok | dok | dqk (default cok)
 *   --out    output directory (created/overwritten)
 *   --amiga  (optional) path to an extracted Amiga game dir (e.g. amiga_extracted/ChampionsOfKrynn).
 *            When given, every PORTABLE DQK art .TLB (BIGPIC master, COMSPR leaf) is replaced with the
 *            superior Amiga artwork lifted through buildPortableArtOverrides — the "best-of art on the
 *            newest engine" goal, baked into the emitted build (E5.4).
 *   --save   (optional) path to a dir holding a party-present SAVGAMA.QSV (+ optional VAULTA.DAT).
 *            Dropped into the build so "Begin Adventuring" / "Load Saved Game" is selectable under
 *            DOSBox WITHOUT mouse-driving character creation (E6.2b). The save's Party Size must be > 0
 *            (validated by the engine's E6.2a decoder, which refuses a roster-empty save).
 *   --save-area N (optional, with --save) patch the dropped SAVGAMA.QSV to RESUME directly into ECL area
 *            N on load (E6.2b-2 "Option B" — e.g. 16 for CoK overland), instead of the uninitiated
 *            fresh-start path. @1029 is written as the retail 4 for every area; --save-dungeon is
 *            accepted as a no-op alias for that, and --save-overland-flag forces the legacy probe
 *            value 3 (which appears in no retail save — see dqkSave.ts's header note).
 *            Optional --save-ecl-member N overrides @21, and --save-x N --save-y N --save-facing N
 *            stage both known DQK pose mirrors for original-runtime movement/SearchLocation probes.
 *   --bypass-protection (optional) patch the emitted DQK.EXE to skip the copy-protection journal-word
 *            prompt entirely (E6.2b-4) — deterministic, vision-free; verified patch sites.
 *   --dqk-id-offset N (optional, default 0) shift EVERY ported GEO/ECL area id by N (and rewrite the
 *            matching static NEWECL cross-references) before packing — round-12/13 id-collision
 *            mitigation, see docs/engine/research/cok-m4-fidelity-plan.md §20/§21 and
 *            buildDqkGameDataMulti's own idOffset option doc. 0 (the default) is a strict no-op.
 *            NOTE: round 15 (§23) live-tested and REFUTED this as a fix for the wandering-encounter
 *            combat-init crash — do not use it for a shipping build, it only adds unverified surface.
 *   --wall-art (optional, target=cok|dok) port the source game's OWN wall art into the emitted
 *            8X8DC.TLB and stamp each resolved area's real wall-set ids into GEO.GLB, replacing the
 *            DQK-native placeholder (`docs/engine/HANDOFF.md` / commit `c801066`,
 *            `packages/engine/src/loaders/cokWallPort.ts`). For CoK: **15/15 playable areas resolve
 *            real wall art** (2026-07-22 — areas 66/97, whose LOAD_PIECES names a set-2 WALLDEF
 *            block (22/18) shipped on NO CoK disk, now resolve via cokWallPort's evidence-gated
 *            two-set fallback: the shipped data proves those areas can only ever have run the
 *            two-set path, which skips set 2 — see the fallback's inline grounding in
 *            `buildCokWallArtPort`). For DoK (generalized 2026-07-19, cross-disk fix 2026-07-19):
 *            resolution runs under DoK's own `ECL_GEN1_SHORT` dialect (required — the plain long
 *            dialect desyncs DoK's short 0x1D/0x22/0x2C operand frames); DoK's shared-256-tile
 *            single-bank wall mechanic is packed by naturally reusing the same per-slot encode path
 *            (no bespoke slicing); and every WALLDEF{k}.DAX/8X8D{k}.DAX archive present under `--src`
 *            is consulted via `buildCrossDiskBlockSource` rather than only the one numbered like the
 *            area's own ECL disk — DoK ships 5 WALLDEF/8X8D disks against only 3 ECL/GEO/MON disks,
 *            and 11 of 19 playable areas' LOAD_PIECES blocks live on a differently-numbered WALLDEF/
 *            8X8D disk (see `docs/engine/research/dok-wall-art-cross-disk.md`). Cross-disk fallback
 *            is only ever taken for an id that agrees byte-for-byte everywhere it appears — CoK's own
 *            real WALLDEF id reuse across disks WITH different content (e.g. id 23 on both WALLDEF1
 *            and WALLDEF3) is detected and never merged, so CoK's coverage is unaffected by this. With
 *            the fix, DoK resolves 18/19 (see the tool's own console output for exactly which areas
 *            resolve, and `docs/engine/HANDOFF.md`'s DoK wall-art entry for the open verification
 *            caveat both games' wall art shares — structural-only, never DOSBox-X-visual-verified).
 *            Requires `--dqk-id-offset 0` (the default) since the port keys off each area's
 *            ORIGINAL id.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDqkGameData,
  buildDqkGameDataMulti,
  buildGen1ItemOverrides,
  planDqkBuild,
  decodeDaa,
  buildPortableArtOverrides,
  patchDqkSaveResumeArea,
  DQK_ART_LAYOUT,
  deserializeSlotMapping,
  readDaxDataBlocks,
  sniffGen1EclBlock,
  buildCokWallArtPort,
  stampCokWallHeaders,
  buildCrossDiskBlockSource,
  ECL_GEN1_SHORT,
  type DqkGameTarget,
  type DaaArchive,
  type AmigaSlotMapping,
  type CokWallDiskSource,
} from '../packages/engine/src/index.js';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dqkDir = resolve(repoRoot, arg('dqk', 'The Dark Queen of Krynn'));
const srcDir = resolve(repoRoot, arg('src', 'Champions of Krynn'));
// Default to the MULTI-disk merge (the complete game, M3.1). `--n <k>` restricts to one disk's set.
const n = arg('n', 'all');
const target = arg('target', 'cok') as DqkGameTarget;
const outDir = resolve(repoRoot, arg('out', `build/${target}-on-dqk`));
const idOffsetArg = arg('dqk-id-offset', '0');
const idOffset = Number(idOffsetArg);
if (!Number.isInteger(idOffset)) throw new Error(`--dqk-id-offset: ${idOffsetArg} is not an integer`);
if (idOffset) console.log(`[build-dqk] id-offset: shifting every ported GEO/ECL area id by ${idOffset}`);

const rd = (p: string) => new Uint8Array(readFileSync(p));

let game;
// Tracked alongside `game` for the optional `--wall-art` post-process step below (needs each disk's
// own raw ECL bytes + disk number to re-derive WALLDEF{k}.DAX/8X8D{k}.DAX paths; buildDqkGameData(Multi)
// consumes the decoded ECL blocks internally and doesn't expose them, so this driver keeps its own copy).
const eclDiskBytes: { diskNum: number; bytes: Uint8Array }[] = [];
if (n === 'all') {
  // Auto-discover every present disk: GEO{k}/ECL{k}.DAX in k order, plus MON{k}CHA.DAX where present
  // (DoK ships only MON1CHA). Each category is merged into one unified GLB (M3.1).
  const collect = (mk: (k: number) => string): Uint8Array[] => {
    const out: Uint8Array[] = [];
    for (let k = 1; ; k++) {
      const p = join(srcDir, mk(k));
      if (!existsSync(p)) break;
      out.push(rd(p));
    }
    return out;
  };
  const geo = collect((k) => `GEO${k}.DAX`);
  const ecl = collect((k) => `ECL${k}.DAX`);
  ecl.forEach((bytes, i) => eclDiskBytes.push({ diskNum: i + 1, bytes }));
  // MON disks can be sparse (DoK has only MON1CHA): gather every existing index up to the GEO/ECL span.
  // The ITM/SPC (Gap G2) and WIZ (DoK-only) side-table archives ride the same sparse per-disk pattern
  // (audit gaps 2-3, cok-content-port-plan.md §9 — previously never collected by this driver).
  const mon: Uint8Array[] = [];
  const itm: Uint8Array[] = [];
  const spc: Uint8Array[] = [];
  const wiz: Uint8Array[] = [];
  const maxK = Math.max(geo.length, ecl.length);
  for (let k = 1; k <= maxK; k++) {
    for (const [name, into] of [
      [`MON${k}CHA.DAX`, mon],
      [`MON${k}ITM.DAX`, itm],
      [`MON${k}SPC.DAX`, spc],
      [`MON${k}WIZ.DAX`, wiz],
    ] as const) {
      const p = join(srcDir, name);
      if (existsSync(p)) into.push(rd(p));
    }
  }
  // Source dialect drives the Gen1→Gen2 ECL operand-frame transcode (2026-07-23,
  // cok-m4-fidelity-plan.md §25): CoK = long (3-op SETUP_MONSTER), DoK = short (already 4-op).
  const eclSourceDialect = target === 'dok' ? ECL_GEN1_SHORT : undefined;
  game = buildDqkGameDataMulti({ geo, mon, ecl, itm, spc, wiz }, { idOffset, eclSourceDialect });
  const m = game.manifest.merge!;
  console.log(
    `[build-dqk] ${target} (merged ${m.sources.geo} GEO / ${m.sources.ecl} ECL / ${m.sources.mon} MON disks): ` +
      `${game.manifest.geoAreas.length} maps, ${game.manifest.eclAreas.length} scripts, ` +
      `${game.manifest.monsters} monsters, ${game.manifest.pairedAreas.length} playable areas.`,
  );
  const tp = game.manifest.eclTranscode;
  const tpTotal = Object.values(tp.patched).reduce((a, b) => a + b, 0);
  console.log(
    `[build-dqk] ECL Gen2 frame transcode: ${tpTotal} trampoline(s) ` +
      `(${Object.entries(tp.patched).map(([op, n]) => `op 0x${Number(op).toString(16)}: ${n}`).join(', ') || 'none'})` +
      (tp.untranslated.length
        ? `; ${tp.untranslated.length} reachable drifted site(s) left untranslated: ` +
          tp.untranslated.map((u) => `area ${u.areaId} op 0x${u.opcode.toString(16)} @0x${u.vaddr.toString(16)}`).join(', ')
        : ''),
  );
  const st = game.manifest.sideTables;
  console.log(
    `[build-dqk] monster side-tables (${itm.length} ITM / ${spc.length} SPC / ${wiz.length} WIZ disks): ` +
      `${st.withItems} with items (${st.totalItems}), ${st.withAffects} with specials (${st.totalAffects}), ` +
      `${st.withSpells} casters (${st.totalSpells} memorized spells).`,
  );
  if (m.monDedupedIds.length) {
    console.log(`[build-dqk] monster slots deduped across disks (byte-identical): ${m.monDedupedIds.length}`);
  }
  if (m.monConflictingIds.length) {
    console.log(`[build-dqk] WARNING: conflicting monster slot ids (kept first): ${m.monConflictingIds.join(', ')}`);
  }
} else {
  // Optional side-table archives for this one disk (audit gaps 2-3): absent files stay undefined.
  const opt = (name: string): Uint8Array | undefined => {
    const p = join(srcDir, name);
    return existsSync(p) ? rd(p) : undefined;
  };
  const eclBytesN = rd(join(srcDir, `ECL${n}.DAX`));
  eclDiskBytes.push({ diskNum: Number(n), bytes: eclBytesN });
  game = buildDqkGameData(
    {
      geo: rd(join(srcDir, `GEO${n}.DAX`)),
      mon: rd(join(srcDir, `MON${n}CHA.DAX`)),
      ecl: eclBytesN,
      itm: opt(`MON${n}ITM.DAX`),
      spc: opt(`MON${n}SPC.DAX`),
      wiz: opt(`MON${n}WIZ.DAX`),
    },
    { idOffset },
  );
  console.log(
    `[build-dqk] ${target} (single disk ${n}): ${game.manifest.geoAreas.length} maps, ` +
      `${game.manifest.eclAreas.length} scripts, ${game.manifest.monsters} monsters, ` +
      `${game.manifest.pairedAreas.length} playable areas.`,
  );
}

// ITEM port (audit gap 1, cok-content-port-plan.md §9): build the ITEM.DAT/ITEMS.DAT overrides from
// the source game's own item files (DoK: global ITEM0.DAX table, loss-free; CoK: area-keyed
// ITEM1..3.DAX through the VOCAB recode) + the shared Gen1 ITEMS catalogue. Previously this driver
// never called the tested port functions, so both rebuilds shipped DQK's own item files verbatim.
let overrides: Record<string, Uint8Array> = {};
if (target !== 'dqk') {
  const itemDaxes: Uint8Array[] = [];
  for (let k = 0; k <= 9; k++) {
    const p = join(srcDir, `ITEM${k}.DAX`);
    if (existsSync(p)) itemDaxes.push(rd(p));
  }
  const itemsPath = join(srcDir, 'ITEMS');
  const itemOverrides = buildGen1ItemOverrides(target, {
    itemDaxes,
    itemsFile: existsSync(itemsPath) ? rd(itemsPath) : undefined,
  });
  overrides = { ...overrides, ...itemOverrides };
  for (const name of Object.keys(itemOverrides)) {
    console.log(`[build-dqk] item port: ${name} overridden from ${target}'s own item data (${itemOverrides[name].length} bytes)`);
  }
  if (!itemOverrides['ITEM.DAT']) console.log(`[build-dqk] item port: no ITEM{k}.DAX found under ${srcDir} (ITEM.DAT stays stock DQK)`);
  if (!itemOverrides['ITEMS.DAT']) console.log(`[build-dqk] item port: no ITEMS file found under ${srcDir} (ITEMS.DAT stays stock DQK)`);
}

// Optional: port CoK's own wall art into 8X8DC.TLB + stamp resolved per-area GEO headers (formerly
// tools/build-cok-wallart-scratch.mts's standalone scratch pipeline, merged in here now that the M4
// fidelity work it was deliberately kept clear of has landed — see commit c801066 and the doc comment
// above). Keyed off each area's ORIGINAL id, so it requires --dqk-id-offset 0 (the default).
// Appends to 8X8DC.TLB, NOT 8X8DB.TLB: DQK.EXE's wall-bank-letter selector is a hardcoded
// `id <= 9 ? 'b' : 'c'` threshold (see cokWallPort.ts's header comment, "Bank routing — SOLVED",
// 2026-07-19) — any appended id (necessarily > 9) is only ever looked up in 8X8DC.TLB.
const wallArtArg = process.argv.indexOf('--wall-art') >= 0;
if (wallArtArg) {
  if (target !== 'cok' && target !== 'dok') {
    throw new Error('--wall-art supports --target cok|dok only (packages/engine/src/loaders/cokWallPort.ts); not supported for --target ' + target);
  }
  if (idOffset !== 0) throw new Error('--wall-art requires --dqk-id-offset 0 (the port keys off each area\'s ORIGINAL id, before any offset)');
  // DoK's ECL uses the 1991+ short operand-frame dialect (see apps/web/src/ui/gameData.ts's `dok`
  // profile eclDialect:'gen1-short'); decoding it under the plain (CoK) dialect desyncs 0x1D/0x22/0x2C.
  const wallArtDialect = target === 'dok' ? ECL_GEN1_SHORT : undefined;
  // Discover EVERY WALLDEF{k}.DAX/8X8D{k}.DAX archive present, not just one per ECL/GEO/MON disk —
  // some titles (DoK: 5 WALLDEF/8X8D disks vs 3 ECL/GEO/MON disks) split wall-art data across more
  // physical archives than content disks, so an area's own ECL disk number is not a reliable guide
  // to which WALLDEF/8X8D archive holds its LOAD_PIECES block (see buildCrossDiskBlockSource's own
  // doc comment and docs/engine/research/dok-wall-art-cross-disk.md). Scanning k=1.. here (rather
  // than reusing eclDiskBytes' own disk count) is what actually finds WALLDEF4/5.DAX for DoK.
  const perDiskWalldef: { diskNum: number; blocks: Map<number, Uint8Array> }[] = [];
  const perDiskTiles: { diskNum: number; blocks: Map<number, Uint8Array> }[] = [];
  for (let k = 1; ; k++) {
    const wdPath = join(srcDir, `WALLDEF${k}.DAX`);
    const tlPath = join(srcDir, `8X8D${k}.DAX`);
    if (!existsSync(wdPath) && !existsSync(tlPath)) break;
    if (existsSync(wdPath)) perDiskWalldef.push({ diskNum: k, blocks: new Map(readDaxDataBlocks(rd(wdPath)).map((b) => [b.blockId, b.raw])) });
    if (existsSync(tlPath)) perDiskTiles.push({ diskNum: k, blocks: new Map(readDaxDataBlocks(rd(tlPath)).map((b) => [b.blockId, b.raw])) });
  }
  console.log(`[build-dqk] wall-art: found ${perDiskWalldef.length} WALLDEF disk(s), ${perDiskTiles.length} 8X8D disk(s) under ${srcDir}`);
  const wdSource = buildCrossDiskBlockSource(perDiskWalldef);
  const tlSource = buildCrossDiskBlockSource(perDiskTiles);
  if (wdSource.ambiguousIds.length) {
    console.log(`[build-dqk] wall-art: WALLDEF ids reused with DIFFERENT content across disks (never cross-disk-resolved): ${wdSource.ambiguousIds.join(', ')}`);
  }
  if (tlSource.ambiguousIds.length) {
    console.log(`[build-dqk] wall-art: 8X8D ids reused with DIFFERENT content across disks (never cross-disk-resolved): ${tlSource.ambiguousIds.join(', ')}`);
  }
  const disks: CokWallDiskSource[] = [];
  for (const { diskNum, bytes } of eclDiskBytes) {
    disks.push({
      ecl: readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw)).map((b) => ({ id: b.blockId, block: b.raw })),
      walldefBlock: (id) => wdSource.lookup(diskNum, id),
      tileBlock: (id) => tlSource.lookup(diskNum, id),
    });
  }
  const wallBankOriginal = rd(join(dqkDir, 'DISK2', '8X8DC.TLB'));
  const port = buildCokWallArtPort(disks, wallBankOriginal, { dialect: wallArtDialect });
  console.log(
    `[build-dqk] wall-art: resolved ${port.resolved.length} area(s) with real CoK wall art, ` +
      `${port.residual.length} residual (kept the DQK-native placeholder), ${port.newSets.length} new 8X8DC.TLB set(s).`,
  );
  const geoMemberIds = new Set(game.manifest.geoAreas);
  for (const a of port.resolved) {
    if (a.note) console.log(`[build-dqk] wall-art:   area ${a.areaId} resolved via ${a.note}`);
  }
  for (const r of port.residual) {
    // A residual with no GEO member has no map, hence no Gen2 GEO wall header to stamp at all —
    // "placeholder" does not even apply to it (overland/cutscene/event scripts land here).
    const scope = geoMemberIds.has(r.areaId) ? '' : ' [script-only area: no GEO map, so no wall header exists — wall art not applicable]';
    console.log(`[build-dqk] wall-art:   area ${r.areaId} residual: ${r.reason}${scope}`);
  }
  const headers = new Map(port.resolved.map((a) => [a.areaId, a.header]));
  const { geoGlb: patchedGeoGlb, stamped } = stampCokWallHeaders(game.geoGlb, headers);
  console.log(`[build-dqk] wall-art: stamped ${stamped.length}/${headers.size} resolved area header(s) into GEO.GLB.`);
  const unstamped = [...headers.keys()].filter((id) => !stamped.includes(id));
  if (unstamped.length) console.log(`[build-dqk] wall-art:   resolved but not a GEO member (no-op, not a playable map): area(s) ${unstamped.join(', ')}`);
  game = { ...game, geoGlb: patchedGeoGlb };
  if (port.wallBankTlb) {
    overrides = { ...overrides, '8X8DC.TLB': port.wallBankTlb };
    console.log(`[build-dqk] wall-art: 8X8DC.TLB override staged (${port.wallBankTlb.length} bytes, ${port.newSets.length} new set(s)).`);
  }
}

// Optional: lift the superior Amiga art for the PORTABLE targets into the build.
const amigaArg = arg('amiga', '');
if (amigaArg) {
  const amigaDir = resolve(repoRoot, amigaArg);
  // Committed curated slot mappings (wave-1): evidence-based Amiga→DQK slot assignments for
  // shape-mismatch targets (block-id/set-id parity + exact dimension parity — see the JSON's
  // provenance/unmapped audit). Loaded per target game; only cok's file exists today.
  let mappings: AmigaSlotMapping[] = [];
  const mappingPath = resolve(repoRoot, 'packages', 'engine', 'data', `${target}-amiga-art-mappings.json`);
  if (existsSync(mappingPath)) {
    const doc = JSON.parse(readFileSync(mappingPath, 'utf8')) as { mappings: unknown[] };
    mappings = doc.mappings.map((m) => deserializeSlotMapping(JSON.stringify(m)));
    for (const m of mappings) {
      console.log(`[build-dqk] curated art mapping: ${m.target} <- ${m.source} (${m.assignments.length} slots)`);
    }
  }
  // Collect the Amiga source files the portable art entries need, searching the disk subfolders.
  const wanted = new Set(
    DQK_ART_LAYOUT.filter((e) => e.verdict === 'portable-master' || e.verdict === 'portable-leaf')
      .map((e) => e.amigaSource)
      .filter((s): s is string => !!s),
  );
  for (const m of mappings) {
    wanted.add(m.source);
    for (const a of m.assignments) if (a.source) wanted.add(a.source); // per-assignment source overrides
  }
  const findFile = (name: string): string | null => {
    for (const disk of readdirSync(amigaDir, { withFileTypes: true })) {
      if (!disk.isDirectory()) continue;
      const p = join(amigaDir, disk.name, name);
      if (existsSync(p)) return p;
    }
    const top = join(amigaDir, name);
    return existsSync(top) ? top : null;
  };
  const sources: Record<string, DaaArchive> = {};
  for (const name of wanted) {
    const path = findFile(name);
    if (path) sources[name] = decodeDaa(rd(path), name);
    else console.log(`[build-dqk] amiga: source ${name} not found under ${amigaDir} (skipping)`);
  }
  // The ORIGINAL DQK .TLB bytes for every mapped target, so buildMappedArtOverride emits a real
  // drop-in (real set-id table preserved, unmapped sets carried over verbatim — same engine id
  // coverage as the original file, which the cok-on-dqk build requires).
  const originals: Record<string, Uint8Array> = {};
  for (const m of mappings) {
    const entry = DQK_ART_LAYOUT.find((e) => e.name === m.target);
    if (!entry) continue;
    const p = join(dqkDir, entry.disk, entry.name);
    if (existsSync(p)) originals[m.target] = rd(p);
    else console.log(`[build-dqk] amiga: original ${entry.disk}/${entry.name} not found (mapping falls back to assigned-slots-only)`);
  }
  const art = buildPortableArtOverrides(sources, mappings, originals);
  overrides = { ...overrides, ...art.overrides }; // merge — don't clobber the item-port overrides
  for (const l of art.lifted) console.log(`[build-dqk] amiga art LIFTED: ${l.target} <- ${l.from}`);
  for (const u of art.unavailable) console.log(`[build-dqk] amiga art unavailable (copied from DQK): ${u.target} <- ${u.from}`);
}

// Optional: drop a party-present saved game so the front menu's "Begin Adventuring" /
// "Load Saved Game" is selectable under DOSBox without mouse-driving character creation (E6.2b).
const saveArg = arg('save', '');
let save: { savgama: Uint8Array; files?: Record<string, Uint8Array> } | undefined;
if (saveArg) {
  const saveDir = resolve(repoRoot, saveArg);
  const savgamaPath = join(saveDir, 'SAVGAMA.QSV');
  if (!existsSync(savgamaPath)) throw new Error(`--save: ${savgamaPath} not found`);
  const files: Record<string, Uint8Array> = {};
  const vaultPath = join(saveDir, 'VAULTA.DAT');
  if (existsSync(vaultPath)) files['SAVE/VAULTA.DAT'] = rd(vaultPath);
  let savgama = rd(savgamaPath);
  const saveAreaArg = arg('save-area', '');
  if (saveAreaArg) {
    const areaId = Number(saveAreaArg);
    // Retail holds @1029 = 4 in every save that has a second block, overland areas included, so
    // 4 is the default. --save-overland-flag reproduces the older probe builds' 3.
    const overland = process.argv.indexOf('--save-overland-flag') >= 0;
    const eclMemberArg = arg('save-ecl-member', '');
    const saveXArg = arg('save-x', '');
    const saveYArg = arg('save-y', '');
    const saveFacingArg = arg('save-facing', '');
    if ((saveXArg && !saveYArg) || (!saveXArg && saveYArg)) {
      throw new Error('--save-x and --save-y must be provided together');
    }
    const eclMemberId = eclMemberArg ? Number(eclMemberArg) : undefined;
    const position = saveXArg ? { x: Number(saveXArg), y: Number(saveYArg) } : undefined;
    const facing = saveFacingArg ? Number(saveFacingArg) : undefined;
    savgama = patchDqkSaveResumeArea(savgama, areaId, { overland, eclMemberId, position, facing });
    const pose =
      position || facing !== undefined
        ? ` pose=${position ? `${position.x},${position.y}` : '-'}${facing !== undefined ? ` facing=${facing}` : ''}`
        : '';
    console.log(
      `[build-dqk] save-drop: resume → ECL area ${areaId}` +
        `${eclMemberId !== undefined ? ` member ${eclMemberId}` : ''} (${overland ? 'overland' : 'dungeon'})${pose}`,
    );
  }
  // DQK.EXE reads the saved game from `C:\SAVE\` (strings `%c:\SAVE\%s`) — the GOG release ships
  // SAVGAMA.QSV in BOTH the game root and SAVE/. Mirror that: planDqkBuild puts savgama at root; we
  // also place it under SAVE/ (next to VAULTA.DAT) so the in-game "Load Saved Game" finds it.
  files['SAVE/SAVGAMA.QSV'] = savgama;
  save = { savgama, files };
  console.log(`[build-dqk] save-drop: ${savgamaPath}${existsSync(vaultPath) ? ' (+ VAULTA.DAT)' : ''}`);
}

const exe = rd(join(dqkDir, 'DQK.EXE'));
const bypassProtection = process.argv.indexOf('--bypass-protection') >= 0;
if (bypassProtection)
  console.log(
    '[build-dqk] bypass-protection: DQK.EXE 0xFC00-flag gate (1D99:1553) patched. ' +
      'NOTE: does NOT stop the journal-word prompt (overlay-12, UNLOCATED) — see dqk-copy-protection.md.',
  );
const plan = planDqkBuild({ gameData: game, exe, target, overrides, save, bypassProtection, conf: { mountPath: '.' } });

// Find where on a DQK release disk a passthrough file lives (DISK1/2/3).
function sourcePathFor(fromName: string, disk: string): string {
  const onDisk = join(dqkDir, disk, fromName);
  if (existsSync(onDisk)) return onDisk;
  throw new Error(`source file ${fromName} not found on ${disk} of ${dqkDir}`);
}

let wrote = 0;
let copied = 0;
for (const f of plan.emit) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.bytes);
  wrote++;
}
for (const f of plan.copy) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(sourcePathFor(f.fromName, f.disk), dest);
  copied++;
}

console.log(`[build-dqk] wrote ${wrote} generated file(s) + copied ${copied} passthrough file(s) -> ${outDir}`);
console.log(`[build-dqk] boot it: dosbox -conf "${join(outDir, 'dosbox.conf')}"`);
