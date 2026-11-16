#!/usr/bin/env node
// Metadata-only source-bound crosswalk for the CoK same-index tile candidates reviewed in
// batches 7 and 8 (goal entry 209 denominator). Reads repo JSON metadata, lists directories under
// named C:/GoldBoxImg roots, and stats paths. It never opens PNG pixels or archive bytes, never
// computes file hashes of PNG or archive bytes, and never runs an importer. It never writes the
// registry, the candidate list, the gap queue, or any registry link.
//
// Run from the repository root:
//   node tools/cok_selected_pair_crosswalk.mjs
// Output: docs/engine/research/cok-selected-pair-crosswalk-2026-11-13.json (overwritten).

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH = "docs/engine/research";
const INPUTS = {
  registry: `${RESEARCH}/cok-graphics-identity-registry-v1.json`,
  candidates: `${RESEARCH}/cok-tile-same-index-candidates-2026-11-10.json`,
  queue: `${RESEARCH}/cok-gap-review-queue-2026-11-10.json`,
};
const OUTPUT = `${RESEARCH}/cok-selected-pair-crosswalk-2026-11-13.json`;
const PACKAGE_ROOT = "apps/web/dist-app-cok57/restyle/cok-generated";
const IMG_ROOT = "C:/GoldBoxImg";
const WORK_ROOT = `${IMG_ROOT}/cok_restyle_work`;
const LISTING_ROOTS = ["cok_restyle_work", "batch03_work", "batch03", "batch01_work", "batch02_review"].map(
  (name) => `${IMG_ROOT}/${name}`,
);
const HASH_PNG = /^[0-9a-f]{64}\.png$/;
const SELECT = /^Batch ([78]) /;
const EXPECTED = {
  directedRows: 41,
  unorderedPairs: 26,
  sourceIds: 45,
  declaredPngHashes: 39,
  archivePaths: 6,
  outcomes: { "possible-counterpart": 31, "not-same": 10 },
};

const sha256Text = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const pad = (n, width) => String(n).padStart(width, "0");
const readJson = async (rel) => JSON.parse(await fs.readFile(path.join(REPO, rel), "utf8"));
const fileExists = (p) => fs.stat(p).then((s) => s.isFile(), () => false);
const fail = (msg) => {
  throw new Error(`crosswalk check failed: ${msg}`);
};

// Importer conventions (read from source, not executed). Each returns the render path the
// importer would read for that archive; existence of that path is checked by stat only.
function importerConvention(asset) {
  const name = asset.archive.name.toUpperCase();
  const block = asset.locator.blockId;
  const tile = asset.locator.tileIndex;
  if (asset.platform === "DOS-EGA") {
    const family = name.replace(/\.DAX$/, "");
    const stem = `${family}_${pad(block, 3)}`;
    return {
      importer: "tools/import_cok_dos_tiles_registry.py",
      rule: "dos_tile_render/<family>/<stem>/<stem>_tile_<TTT>.png",
      path: `${WORK_ROOT}/dos_tile_render/${family}/${stem}/${stem}_tile_${pad(tile, 3)}.png`,
    };
  }
  if (asset.platform === "Amiga" && name === "8X8D1.DAX") {
    const stem = `8X8D1_${pad(block, 3)}`;
    return {
      importer: "tools/import_cok_amiga_dax_tiles_registry.py",
      rule: "fallback only: dos_tile_render/8X8D1/<stem>/<stem>_tile_<TTT>.png when the package copy is absent",
      path: `${WORK_ROOT}/dos_tile_render/8X8D1/${stem}/${stem}_tile_${pad(tile, 3)}.png`,
    };
  }
  if (asset.platform === "Amiga" && (name === "8X8D0.DAA" || name === "8X8D1.DAA")) {
    const stem = `8X8D0_${pad(block, 3)}_tile_${pad(tile, 2)}`;
    return {
      importer: "tools/import_cok_amiga_8x8d0_registry.py",
      rule: "amiga_non_picture_source/8X8D0_<BBB>/8X8D0_<BBB>_tile_<TT>.png (8X8D1.DAA uses the 8X8D0 render, byte-identical archive)",
      path: `${WORK_ROOT}/amiga_non_picture_source/8X8D0_${pad(block, 3)}/${stem}.png`,
    };
  }
  if (asset.platform === "Amiga" && name === "8X8D2.DAA") {
    const stem = `8X8D2_${pad(block, 3)}_tile_${pad(tile, 2)}`;
    return {
      importer: "tools/import_cok_amiga_8x8d2_registry.py",
      rule: "amiga_non_picture_source/8X8D2_<BBB>/8X8D2_<BBB>_tile_<TT>.png",
      path: `${WORK_ROOT}/amiga_non_picture_source/8X8D2_${pad(block, 3)}/${stem}.png`,
    };
  }
  fail(`no importer convention for ${asset.id} (${asset.platform} ${name})`);
}

// Listing only: collect hash-named PNG paths under the named roots. No file is opened.
async function listHashNamedPngs(dir, wanted, found, stats) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    stats.unreadableDirs += 1;
    return;
  }
  for (const entry of entries) {
    const child = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      stats.symlinksSkipped += 1;
    } else if (entry.isDirectory()) {
      stats.directoriesVisited += 1;
      await listHashNamedPngs(child, wanted, found, stats);
    } else if (entry.isFile() && HASH_PNG.test(entry.name)) {
      stats.hashNamedPngsSeen += 1;
      const hash = entry.name.slice(0, -4);
      if (wanted.has(hash)) found.push({ hash, path: child });
    }
  }
}

async function main() {
  const inputBytes = {};
  const json = {};
  for (const [key, rel] of Object.entries(INPUTS)) {
    const buf = await fs.readFile(path.join(REPO, rel));
    inputBytes[key] = { path: rel, sha256: sha256Text(buf), bytes: buf.length };
    json[key] = JSON.parse(buf.toString("utf8"));
  }
  const registry = json.registry;
  const byId = new Map(registry.assets.map((a) => [a.id, a]));
  const queueById = new Map(json.queue.rows.map((r) => [r.id, r]));

  // Selection: candidate rows whose recorded outcome is from batch 7 or 8.
  const selected = json.candidates.candidates
    .map((c, candidateListIndex) => ({ c, candidateListIndex }))
    .filter(({ c }) => SELECT.test(c.outcomeNote));
  const directed = selected.map(({ c, candidateListIndex }) => ({ c, candidateListIndex, batch: Number(c.outcomeNote.match(SELECT)[1]) }));
  if (directed.length !== EXPECTED.directedRows) fail(`directed rows ${directed.length} != ${EXPECTED.directedRows}`);

  const unorderedKeys = new Set(directed.map(({ c }) => [c.gapId, c.peerId].sort().join(" <> ")));
  if (unorderedKeys.size !== EXPECTED.unorderedPairs) fail(`unordered pairs ${unorderedKeys.size}`);
  const sourceIds = new Set(directed.flatMap(({ c }) => [c.gapId, c.peerId]));
  if (sourceIds.size !== EXPECTED.sourceIds) fail(`source IDs ${sourceIds.size}`);
  const outcomes = {};
  for (const { c } of directed) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
  for (const [k, v] of Object.entries(EXPECTED.outcomes)) if (outcomes[k] !== v) fail(`outcome ${k} ${outcomes[k]} != ${v}`);
  for (const id of sourceIds) if (!byId.has(id)) fail(`registry lacks ${id}`);

  // Registry-side metadata for every source ID. Links are read, never changed.
  const linksByAsset = new Map();
  for (const link of registry.crossVersionLinks) {
    for (const id of [link.fromAssetId, link.toAssetId]) {
      if (!linksByAsset.has(id)) linksByAsset.set(id, []);
      linksByAsset.get(id).push({
        fromAssetId: link.fromAssetId,
        toAssetId: link.toAssetId,
        relation: link.relation,
        confidence: link.confidence,
      });
    }
  }
  const sourceRecord = (id) => {
    const a = byId.get(id);
    const q = queueById.get(id);
    const conv = importerConvention(a);
    return {
      id,
      platform: a.platform,
      edition: a.edition,
      archive: { name: a.archive.name, path: a.archive.path, sha256: a.archive.sha256 },
      locator: a.locator,
      decoded: { path: a.decoded.path, sha256: a.decoded.sha256, pixelSha256: a.decoded.pixelSha256, width: a.decoded.width, height: a.decoded.height },
      identityStatus: a.identityStatus,
      registryEvidence: (a.description?.evidence || []).map((e) => ({ kind: e.kind, reference: e.reference })),
      gapQueue: q ? { status: q.status, matchField: q.matchField, peerCount: q.peers.length } : { status: "not-in-gap-queue" },
      registryLinks: linksByAsset.get(id) || [],
      importerConvention: conv,
    };
  };
  const sources = [...sourceIds].sort().map(sourceRecord);

  // Directed rows, each with its review reference (candidate list index, batch, outcome, note).
  const rows = directed
    .map(({ c, candidateListIndex, batch }) => ({
      candidateListIndex,
      direction: `${c.gapId} -> ${c.peerId}`,
      unorderedPair: [c.gapId, c.peerId].sort().join(" <> "),
      gapId: c.gapId,
      peerId: c.peerId,
      gapPlatform: c.gapPlatform,
      peerPlatform: c.peerPlatform,
      gapArchive: c.gapArchive,
      peerArchive: c.peerArchive,
      blockId: c.blockId,
      tileIndex: c.tileIndex,
      review: {
        candidateList: INPUTS.candidates,
        candidateListIndex,
        batch,
        outcome: c.outcome,
        outcomeNote: c.outcomeNote,
        ruleNote: `${RESEARCH}/cok-tile-same-index-rule-result-2026-11-12.md`,
        claimStatus: "inherited-claim-not-reverified",
      },
      sourcePixelHashes: {
        gap: byId.get(c.gapId).decoded.pixelSha256,
        peer: byId.get(c.peerId).decoded.pixelSha256,
        samePixelHash: byId.get(c.gapId).decoded.pixelSha256 === byId.get(c.peerId).decoded.pixelSha256,
      },
    }))
    .sort((a, b) => a.candidateListIndex - b.candidateListIndex);

  // Pair-level consistency: both directions of one unordered pair should carry one outcome.
  const pairs = new Map();
  for (const row of rows) {
    if (!pairs.has(row.unorderedPair)) pairs.set(row.unorderedPair, []);
    pairs.get(row.unorderedPair).push(row);
  }
  const pairRecords = [...pairs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, members]) => {
      const outs = [...new Set(members.map((m) => m.review.outcome))];
      return {
        unorderedPair: key,
        directedRowCandidateIndices: members.map((m) => m.candidateListIndex),
        reverseDirectionPresent: members.length === 2,
        outcomes: outs,
        outcomeConsistent: outs.length === 1,
      };
    });
  // Conflicting outcomes across the two directions of one pair are inherited from the review
  // files. They are recorded and reported, never resolved here (no image is re-judged).
  const outcomeConflicts = pairRecords.filter((p) => !p.outcomeConsistent).map((p) => p.unorderedPair);

  // Declared PNG hashes: one record per distinct decoded.sha256 across the 45 source IDs.
  const declaring = new Map();
  for (const s of sources) {
    if (!declaring.has(s.decoded.sha256)) declaring.set(s.decoded.sha256, []);
    declaring.get(s.decoded.sha256).push(s);
  }
  if (declaring.size !== EXPECTED.declaredPngHashes) fail(`declared PNG hashes ${declaring.size}`);
  const archivePathKeys = new Set(sources.map((s) => `${s.archive.path}|${s.archive.sha256}`));
  if (new Set(sources.map((s) => s.archive.path)).size !== EXPECTED.archivePaths) fail("archive path count");

  // Stats-only resolution of each declared PNG under the package folder and the named roots.
  const wanted = new Set(declaring.keys());
  const listed = [];
  const listStats = { directoriesVisited: 0, hashNamedPngsSeen: 0, unreadableDirs: 0, symlinksSkipped: 0 };
  const rootCounts = {};
  for (const root of LISTING_ROOTS) {
    const before = listed.length;
    await listHashNamedPngs(root, wanted, listed, listStats);
    rootCounts[root] = listed.length - before;
  }
  const copiesByHash = new Map();
  for (const { hash, path: p } of listed) {
    if (!copiesByHash.has(hash)) copiesByHash.set(hash, []);
    copiesByHash.get(hash).push(p);
  }

  const pngRecords = [];
  for (const [hash, members] of [...declaring.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const packagePath = `${REPO}/${PACKAGE_ROOT}/images/${hash}.png`;
    const packageExists = await fileExists(packagePath);
    const copies = (copiesByHash.get(hash) || []).sort();
    const conventionPaths = [...new Set(members.map((m) => m.importerConvention.path))].sort();
    const conventionChecks = [];
    for (const p of conventionPaths) conventionChecks.push({ path: p, exists: await fileExists(p) });
    let resolution;
    let explicitPath = null;
    if (packageExists) {
      resolution = "package-path-exists";
      explicitPath = packagePath;
    } else if (copies.length > 0) {
      resolution = "named-root-copy-exists";
      explicitPath = copies[0];
    } else if (conventionChecks.some((c) => c.exists)) {
      resolution = "convention-render-path-exists";
      explicitPath = conventionChecks.find((c) => c.exists).path;
    } else {
      resolution = "unresolved";
    }
    pngRecords.push({
      declaredPath: members[0].decoded.path,
      sha256: hash,
      pixelSha256Values: [...new Set(members.map((m) => m.decoded.pixelSha256))].sort(),
      declaringSourceIds: members.map((m) => m.id).sort(),
      archives: [...new Set(members.map((m) => m.archive.name))].sort(),
      packagePath: { path: `${PACKAGE_ROOT}/images/${hash}.png`, exists: packageExists },
      namedRootCopyCount: copies.length,
      namedRootCopies: copies,
      conventionPaths: conventionChecks,
      resolution,
      explicitLocalPath: explicitPath,
      byteVerified: false,
      byteVerificationNote: "Not performed. Name equals the declared SHA-256 is a name match only; file bytes were not read or hashed.",
    });
  }
  const resolutionCounts = {};
  for (const r of pngRecords) resolutionCounts[r.resolution] = (resolutionCounts[r.resolution] || 0) + 1;

  // Archive path existence (stat only). DOS archives are repo-relative; Amiga archives are absolute.
  const archiveRecords = [...new Map(sources.map((s) => [`${s.archive.path}|${s.archive.sha256}`, s.archive])).values()]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((a) => {
      const isAbsolute = /^[A-Za-z]:\//.test(a.path);
      const resolved = isAbsolute ? a.path : `${REPO}/${a.path}`;
      return { name: a.name, path: a.path, sha256: a.sha256, checkedAt: resolved, exists: null };
    });
  for (const a of archiveRecords) a.exists = await fileExists(a.checkedAt);

  // Duplicate checks.
  const countBy = (values) => {
    const m = new Map();
    for (const v of values) m.set(v, (m.get(v) || 0) + 1);
    return m;
  };
  const dupPixel = [...countBy(sources.map((s) => s.decoded.pixelSha256)).entries()].filter(([, n]) => n > 1);
  const dupFile = [...countBy(sources.map((s) => s.decoded.sha256)).entries()].filter(([, n]) => n > 1);
  const archiveShaGroups = new Map();
  for (const a of archiveRecords) {
    if (!archiveShaGroups.has(a.sha256)) archiveShaGroups.set(a.sha256, []);
    archiveShaGroups.get(a.sha256).push(a.path);
  }
  const sharedArchiveShas = [...archiveShaGroups.entries()].filter(([, paths]) => paths.length > 1).map(([sha, paths]) => ({ sha256: sha, paths }));
  const conventionShared = new Map();
  for (const s of sources) {
    const p = s.importerConvention.path;
    if (!conventionShared.has(p)) conventionShared.set(p, []);
    conventionShared.get(p).push(s.id);
  }
  const sharedConventionPaths = [...conventionShared.entries()].filter(([, ids]) => ids.length > 1).map(([p, ids]) => ({ path: p, sourceIds: ids.sort() }));
  const copyDuplicates = pngRecords.filter((r) => r.namedRootCopyCount > 1).length;

  const linkedRegistryOnly = sources
    .filter((s) => s.gapQueue.status === "not-in-gap-queue")
    .map((s) => ({ id: s.id, registryLinks: s.registryLinks }));

  const output = {
    schema: "cok-selected-pair-crosswalk-v1",
    slice: "goal 209 denominator (batches 7-8 same-index tile candidates); recorded as goal entry 210",
    claimStatus: {
      identitiesAndOutcomes: "inherited-claims-not-reverified",
      note: "Candidate pairs, outcomes and visual reads are copied from the recorded review files. This crosswalk does not re-judge images and makes no new same-scene or identity claim.",
    },
    scope: {
      readOnly: true,
      readsPngPixels: false,
      readsArchiveBytes: false,
      hashesOnlyTheRepoJsonInputs: true,
      computesPngOrArchiveHashes: false,
      runsImporters: false,
      writesRegistry: false,
      writesCandidateList: false,
      writesGapQueue: false,
      promotesPossibleCounterpart: false,
      addsThreshold: false,
    },
    generator: "tools/cok_selected_pair_crosswalk.mjs",
    inputs: inputBytes,
    counts: {
      directedRows: rows.length,
      unorderedPairs: pairRecords.length,
      sourceIds: sources.length,
      declaredPngHashes: pngRecords.length,
      distinctArchivePaths: new Set(sources.map((s) => s.archive.path)).size,
      distinctArchivePathSha: archivePathKeys.size,
      outcomes,
      sourceIdsInGapQueue: sources.filter((s) => s.gapQueue.status !== "not-in-gap-queue").length,
      sourceIdsNotInGapQueue: sources.filter((s) => s.gapQueue.status === "not-in-gap-queue").length,
    },
    pngResolution: { resolutionCounts, listingRoots: LISTING_ROOTS, listingRootCounts: rootCounts, listingStats: listStats },
    duplicates: {
      declaredPngHashesShared: dupFile.map(([hash, n]) => ({ sha256: hash, sourceIdCount: n })),
      pixelHashesShared: dupPixel.map(([hash, n]) => ({ pixelSha256: hash, sourceIdCount: n })),
      archiveShaSharedAcrossPaths: sharedArchiveShas,
      importerConventionPathsShared: sharedConventionPaths,
      declaredHashesWithMultipleNamedRootCopies: copyDuplicates,
    },
    importersInspected: [
      { file: "tools/import_cok_dos_tiles_registry.py", role: "DOS 8X8D1/2/3.DAX tile rows", ran: false },
      { file: "tools/import_cok_amiga_dax_tiles_registry.py", role: "Amiga 8X8D1.DAX disk-2 copy (archive-qualified IDs)", ran: false },
      { file: "tools/import_cok_amiga_8x8d0_registry.py", role: "Amiga 8X8D0.DAA and 8X8D1.DAA tile rows", ran: false },
      { file: "tools/import_cok_amiga_8x8d2_registry.py", role: "Amiga 8X8D2.DAA tile rows", ran: false },
    ],
    archives: archiveRecords,
    sources,
    directedRows: rows,
    unorderedPairs: pairRecords,
    declaredPngs: pngRecords,
    registryOnlyPeers: linkedRegistryOnly,
    unresolvedDeclaredPngs: pngRecords.filter((r) => r.resolution === "unresolved").map((r) => r.sha256),
    outcomeConflicts,
  };

  await fs.writeFile(path.join(REPO, OUTPUT), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        output: OUTPUT,
        counts: output.counts,
        resolutionCounts,
        listingStats: listStats,
        duplicatesDeclaredShared: dupFile.length,
        pixelShared: dupPixel.length,
        archiveShaShared: sharedArchiveShas.length,
        archives: archiveRecords.map((a) => ({ path: a.path, exists: a.exists })),
        outcomeConflicts,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
