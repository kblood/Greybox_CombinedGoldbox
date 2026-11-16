/**
 * GLIB golden-file parity test (Amiga big-endian DataLib, planar).
 *
 * For each fixture (test/fixtures/glib/*.json — produced by make-fixtures.py
 * from tools/glib_decode.py), run the TS decodeGlib on the SAME source .TLB,
 * find the image with the same walk label, and assert EXACT equality of width,
 * height, the index array, AND the palette-mapped RGB against the Python
 * decoder.
 *
 * GLIB sources are the user's EXTERNAL Amiga WHDLoad installs (absolute paths
 * in the fixture, read-only, never vendored) — absent fixture or source file
 * => SKIP, exactly like the other golden suites.
 *
 * Transparency: both masked families key 255 (two-stream 0x03/0xE3 untouched
 * pixels, and raw-masked 0x01/0xE1 pixels whose mask bit is 1 — polarity
 * proven corpus-wide); Python renders 255 THROUGH the palette, so for parity
 * we render opaque (transparentIndex forced null) to mirror indices_to_rgb
 * exactly.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeGlib, sniffGlib } from '../src/loaders/glib.js';
import { decodeAsset } from '../src/index.js';
import { sniffHlib } from '../src/loaders/hlib.js';
import { sniffIlbm } from '../src/loaders/ilbm.js';
import { sniffDaa } from '../src/loaders/daa.js';
import { sniffDax } from '../src/loaders/dax.js';
import { indexedToRGBA } from '../src/render/rgba.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'glib');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

interface Fixture {
  file: string;
  stem: string;
  label: string;
  width: number;
  height: number;
  drawMethod: number;
  indices: number[];
  rgb: number[];
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

const fixtures = listFixtures();

describe('GLIB golden parity (TS decodeGlib vs Python glib_decode)', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures present — run `python test/make-fixtures.py` (needs the external Amiga drive)', () => {
      /* skipped */
    });
    return;
  }

  for (const fname of fixtures) {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, fname), 'utf8'),
    ) as Fixture;
    const srcPath = isAbsolute(fixture.file)
      ? fixture.file
      : join(REPO_ROOT, fixture.file);
    const label = `${fixture.stem} ${fixture.label} (${fixture.width}x${fixture.height}, method 0x${fixture.drawMethod.toString(16)})`;

    if (!existsSync(srcPath)) {
      it.skip(`${label} — source file missing: ${fixture.file}`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${label} matches the Python decode exactly`, () => {
      const bytes = new Uint8Array(readFileSync(srcPath));
      expect(sniffGlib(bytes)).toBe(true);
      const archive = decodeGlib(bytes, fixture.stem);
      const member = archive.images.find((m) => m.label === fixture.label);

      expect(member, `image ${fixture.label} should decode`).toBeDefined();
      if (!member) return;
      const image = member.image;

      expect(image.width).toBe(fixture.width);
      expect(image.height).toBe(fixture.height);
      expect(member.drawMethod).toBe(fixture.drawMethod);
      expect(image.indices.length).toBe(fixture.width * fixture.height);

      // Exact index parity.
      expect(Array.from(image.indices)).toEqual(fixture.indices);

      // RGB parity vs Python indices_to_rgb: render opaque so 255 maps through
      // the palette exactly as the Python oracle does (no alpha keying).
      const opaque = { ...image, transparentIndex: null };
      const rgba = indexedToRGBA(opaque);
      const px = fixture.width * fixture.height;
      let mismatch = -1;
      for (let p = 0; p < px; p++) {
        const o = p * 4;
        if (
          rgba[o] !== fixture.rgb[p * 3] ||
          rgba[o + 1] !== fixture.rgb[p * 3 + 1] ||
          rgba[o + 2] !== fixture.rgb[p * 3 + 2]
        ) {
          mismatch = p;
          break;
        }
      }
      expect(mismatch, `RGB mismatch at pixel ${mismatch}`).toBe(-1);
    });
  }
});

/**
 * Silent data loss in `decodeGlib` — a decode path that returned nothing where the file
 * actually held something.
 *
 * `decodeGlib` decides image-vs-data from the container's own outer tag. Gateway and Treasures
 * tag whole non-picture Amiga libraries (monster / item / GEO / script / text records) `GLIB` or
 * `TILE` where every other title uses `DATA`, so those files entered the image-master walk, every
 * member failed the `sniffGlib` gate, and the walk `continue`d past all of them — returning
 * `images: []` and `rawMembers: []`, i.e. the whole payload gone with no diagnostic.
 *
 * These are read-only, never-vendored external Amiga sources; absent => skip.
 */
describe('decodeGlib exposes bytes it cannot decode instead of dropping them', () => {
  const WHD =
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';
  const mistagged = [
    { rel: `${WHD}/GatewayToSavageFrontier/data/DiskB/MonCha.glb`, tag: 'GLIB' },
    { rel: `${WHD}/GatewayToSavageFrontier/data/DiskB/Item.glb`, tag: 'GLIB' },
    { rel: `${WHD}/TreasuresOfSavageFrontier/data/DiskC/Luck.glb`, tag: 'TILE' },
  ];

  for (const m of mistagged) {
    it.skipIf(!existsSync(m.rel))(`${m.rel.split('/').pop()} yields its members, not silence`, () => {
      const arc = decodeGlib(new Uint8Array(readFileSync(m.rel)), 'mistagged');
      expect(arc.tag).toBe(m.tag);
      // The bug: this file produces no images at all, which USED to mean it produced nothing.
      expect(arc.images.length).toBe(0);
      expect(arc.rawMembers.length).toBeGreaterThan(0);
      const recovered = arc.rawMembers.reduce((n, r) => n + r.byteLength, 0);
      // Nearly the whole file must come back — this is the number the drop used to destroy.
      expect(recovered / readFileSync(m.rel).byteLength).toBeGreaterThan(0.9);
    });
  }

  it.skipIf(!existsSync(`${WHD}/DarkQueenOfKrynn/data/Disk3/FRAME.TLB`))(
    'NULL: a genuine picture file still decodes to images, and loses almost nothing',
    () => {
      const p = `${WHD}/DarkQueenOfKrynn/data/Disk3/FRAME.TLB`;
      const arc = decodeGlib(new Uint8Array(readFileSync(p)), 'frame');
      // The control that makes the assertions above mean something: on a real image container
      // the same code path produces images, so an empty `images` really is diagnostic.
      expect(arc.images.length).toBeGreaterThan(0);
      const undecoded = arc.rawMembers.reduce((n, r) => n + r.byteLength, 0);
      // The residue used to be the three drawing-method-0x19 composite members — the Amiga twin
      // of the DOS HLIB method-25 slots. Round 35 R3 parses and assembles them into
      // `arc.composites`, so this file's residue is now exactly zero rather than merely small.
      // The inequality is kept (it is what makes this a NULL for the mistagged files above);
      // the two lines below pin the stronger fact it no longer expresses.
      expect(undecoded).toBeLessThan(readFileSync(p).byteLength * 0.05);
      expect(undecoded).toBe(0);
      expect(arc.composites).toHaveLength(3);
    },
  );
});

/**
 * The dispatcher gap: `decodeAsset` sniffed HLIB, ILBM, DAA and DAX but not GLIB, so every
 * Amiga container from the DQK-and-later generation threw `unrecognized container format`
 * from any caller on the generic path — the asset browser, `loadGame`, the NWN preview.
 * `decodeGlib` itself worked the whole time; `explore.ts` imported it directly, which is why
 * the Amiga wall-art routes were green and nothing pointed at the hole.
 *
 * Sweep of the user's external WHDLoad packs at the time this landed: 152 GLIB files across
 * six distinct titles yielding 13,884 images, 0 throws (177 / 16,483 counting the German
 * Pools pack, which duplicates the English one).
 */
describe('decodeAsset dispatches GLIB, not just its DOS sibling', () => {
  const WHD =
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';
  const samples = [
    `${WHD}/PoolsOfDarkness/data/Disk2/8X8D.TLB`,
    `${WHD}/GatewayToSavageFrontier/data/DiskC/Walls.tlb`,
    `${WHD}/GatewayToSavageFrontier/data/DiskA/Always.tlb`,
  ].filter((p) => existsSync(p));

  it('routes a real Amiga GLIB container to the glib arm and yields images', () => {
    if (samples.length === 0) return; // external source absent — same skip contract as above
    for (const path of samples) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(sniffGlib(bytes)).toBe(true);
      const decoded = decodeAsset(bytes, path.split('/').pop()!);
      expect(decoded.format).toBe('glib');
      if (decoded.format !== 'glib') throw new Error('unreachable');
      expect(decoded.archive.images.length).toBeGreaterThan(0);
    }
  });

  it('NULL: the GLIB arm is not a catch-all — DOS HLIB and DAX still route to their own arms', () => {
    // Without this, a `sniffGlib` that returned true for everything would satisfy the test
    // above while breaking every other format. Both files are repo-local DOS containers.
    const hlib = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK1', 'TITLE.TLB');
    const dax = resolve(REPO_ROOT, 'Champions of Krynn', 'DUNGCOM.DAX');
    if (existsSync(hlib)) {
      const bytes = new Uint8Array(readFileSync(hlib));
      expect(sniffGlib(bytes)).toBe(false);
      expect(decodeAsset(bytes, 'TITLE.TLB').format).toBe('hlib');
    }
    if (existsSync(dax)) {
      const bytes = new Uint8Array(readFileSync(dax));
      expect(sniffGlib(bytes)).toBe(false);
      expect(decodeAsset(bytes, 'DUNGCOM.DAX').format).toBe('dax');
    }
  });

  it('NULL: no other arm could have taken these files, which is why they threw', () => {
    // The claim being tested is "GLIB was unreachable", so the null has to be "nothing else was
    // quietly handling it". For each real container, every other sniff must be false -- if any
    // were true the format would already have decoded (as the wrong thing) and the bug report
    // would be different. HLIB is included because it is the closest sibling and shares the
    // member layout: a `sniffHlib` loose enough to take 'GLIB' would have hidden this for years.
    if (samples.length === 0) return;
    for (const path of samples) {
      const bytes = new Uint8Array(readFileSync(path));
      expect(sniffHlib(bytes)).toBe(false);
      expect(sniffIlbm(bytes)).toBe(false);
      expect(sniffDaa(bytes)).toBe(false);
      expect(sniffDax(bytes)).toBe(false);
      expect(sniffGlib(bytes)).toBe(true);
    }
  });

  it('the magic, not a structural heuristic, is what routes GLIB — so dispatch order matters', () => {
    // Perturbing byte 0 of a real GLIB container from 'G' to 'X' makes `sniffDaa` accept it, so
    // the dispatcher commits the file to the DAA branch. Nothing real hits that path -- GLIB is
    // sniffed before DAA and the magic is exact -- but it pins why the order in `decodeAsset` is
    // load-bearing rather than cosmetic: DAA's sniff is structural and will claim a GLIB-shaped
    // file given the chance.
    //
    // Until 2026-08-25 the claim went further and the file DECODED as DAA, because the 6-byte
    // sub-frame arm validated nothing. It now throws on this container's first pad byte (0x42).
    // The routing half of the point is unchanged and is what this test is about: the failure is
    // DAA's, not the generic "unrecognized container format", which is only reachable if the DAA
    // branch was entered. See `daaIndexValidation.test.ts`.
    if (samples.length === 0) return;
    const bytes = new Uint8Array(readFileSync(samples[0]!));
    expect(decodeAsset(bytes, 'x.TLB').format).toBe('glib');
    const broken = bytes.slice();
    broken[0] = 0x58;
    expect(sniffGlib(broken)).toBe(false);
    expect(sniffDaa(broken)).toBe(true);
    expect(() => decodeAsset(broken, 'x.TLB')).toThrow(/^DAA: /);
    // The null: had the dispatcher NOT routed it to DAA, this is the message it would carry.
    expect(() => decodeAsset(broken, 'x.TLB')).not.toThrow(/unrecognized container format/);
  });
});
