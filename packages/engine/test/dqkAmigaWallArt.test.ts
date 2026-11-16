/**
 * The Dark Queen of Krynn — is its Amiga wall art a candidate for the DOS↔Amiga art toggle?
 *
 * The third and last GLIB/DataLib-era title to be assessed, after Pools of Darkness
 * (`poolsAmigaWallArt.test.ts`, accepted) and Gateway (`gatewayAmigaWallArt.test.ts`, accepted for
 * 25 of 26 banks). DQK is different in kind from both, and this file records HOW rather than
 * wiring anything: DQK's `graphics_switch` gap is NOT gated on the parity measurement that gated
 * the other two.
 *
 * Three reasons, in order of how hard they are to move:
 *
 *   1. **There is no first-person wall view to toggle.** `apps/web/src/ui/dqkExplore.ts` renders a
 *      top-down automap; it contains zero uses of `loadDungeonWalls`, `composeWallView` or
 *      `planWallView`. A second wall-art source has nothing to draw into. This is the real blocker
 *      and it is engine work, not asset work.
 *   2. **The proof the other two titles used is unavailable.** Pools and Gateway were licensed by
 *      Amiga WALLDEF records being BYTE-IDENTICAL to the DOS ones, so shared geometry provably
 *      indexes the art. DQK ships no WALLDEF file on either platform, and `GEO.GLB`'s per-area
 *      header bytes 2-7 name only the resource SETS (see `buildDqkGame.ts`). Any future DQK swap
 *      needs a different argument. NOTE: an earlier draft said flatly that "Gen2 keeps wall
 *      geometry in `DQK.EXE`". That overstated it — the last two tests below show the frames carry
 *      their own placement AND that a 47-frame set is Gen1's own piece vocabulary, so what is
 *      actually missing from the data is only which frame answers which wall configuration.
 *   3. **38% of the Amiga frames do not decode yet** (asserted below), so the art source is not
 *      currently complete enough to offer even if 1 and 2 were solved. R4 (PLAN-ROUND-31.md) dug
 *      into WHY: every one of the 305 stubs is the identical byte record `h=1, wb=1, dm=0xE1,
 *      body=6 bytes` — one literal placeholder reused everywhere, not per-member noise or an
 *      unimplemented codec variant. 76 of them are ALSO an 8x1 placeholder on the DOS twin
 *      (genuinely blank/unused wall-piece slots on both platforms — not a gap at all). The
 *      remaining 229 are the "-right" member of a mirrored pair (far-right/mid-right/near-right)
 *      that the Amiga master never stores, always with only 2 corpus-wide exceptions where it
 *      does. No (nplanes, variant) byte-budget hypothesis — raw contiguous, raw masked, or
 *      RLE'd, checked against the DOS oracle's real dimensions with the real `_rle18` — is
 *      satisfiable by any of the 305 six-byte bodies, so `glib.ts` is UNCHANGED by R4: this is a
 *      numbered negative, not an unfixed bug. Full histogram, per-member arithmetic and the
 *      piece-level explanation: `docs/engine/research/dqk-amiga-glib-frame-variant.md` and
 *      `tools/glib_frame_census.py` / `tools/test_glib_frame_census.py`.
 *
 * What this file DOES establish is the encouraging half, and it is worth locking down because it
 * says the eventual swap is likely to be sound: the two platforms' wall containers are structurally
 * parallel — identical member counts, the same 47-frame set grouping, and, wherever the Amiga side
 * decodes at all, near-total agreement on per-frame dimensions at shift 0. That is the same
 * "ports change pixels, not geometry" signature Pools and Gateway showed.
 *
 * These assertions are deliberately written to FAIL when the Amiga decoder improves. The stub
 * counts are a snapshot of a known gap, not a specification — a failure here means the gap closed
 * and this file should be re-derived, which is the intended signal.
 *
 * Retail bytes come from the local installs; the suite skips when either is absent, since neither
 * the GOG install nor the Amiga WHDLoad set is vendored.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { decodeGlib } from '../src/loaders/glib.js';
import { decodeHlib } from '../src/loaders/hlib.js';
import type { IndexedImage } from '../src/model/index.js';

const DOS = 'C:/Modding/GoldBox/The Dark Queen of Krynn';
const AMIGA =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data';

const have = existsSync(`${DOS}/DISK2/8X8DB.TLB`) && existsSync(`${AMIGA}/Disk2/8X8DB.TLB`);
const maybe = have ? describe : describe.skip;

const read = (p: string) => new Uint8Array(readFileSync(p));

/** DQK's wall containers hold variable-size perspective frames, not 8x8 tiles, despite the name. */
const FRAMES_PER_SET = 47;

/** A member the Amiga GLIB decoder could not resolve: it yields a degenerate 8x1 image. */
const isStub = (t: IndexedImage) => t.width === 8 && t.height === 1;

/** Set-relative index of each of the 5 view slices in a 47-frame set (see the selection test). */
const SLICE_AT = [1, 11, 20, 29, 38] as const;
/** Gen1 PIECES widths minus the far-cap; near-front (index 6) varies by wall variant. */
const NOMINAL_W = [8, 8, 8, 24, 16, 16, null, 16, 16] as const;

/** Gen1 PIECES order within a 9-piece slice run (see the depth-ordering test below). */
const PIECE_NAMES = [
  'far-front', 'far-left', 'far-right',
  'mid-front', 'mid-left', 'mid-right',
  'near-front', 'near-left', 'near-right',
] as const;

/**
 * DQK's own wall-piece vocabulary within a 47-frame set (cap+9, cap+9, 9, 9, 9): given a
 * SET-RELATIVE index, name which piece it is. Mirrors tools/glib_frame_census.py's `piece_of`
 * exactly, so the two independent implementations (TS engine, Python census) can be compared.
 */
const pieceOf = (setRelative: number): string => {
  if (setRelative === 0) return 'cap-far';
  if (setRelative === 10) return 'cap-near';
  for (const a of SLICE_AT) {
    if (setRelative >= a && setRelative < a + 9) return PIECE_NAMES[setRelative - a];
  }
  return `other(${setRelative})`;
};

const dosFrames = (f: string) => decodeHlib(read(`${DOS}/DISK2/${f}`), f).images.map((m) => m.image);
const amigaFrames = (f: string) => decodeGlib(read(`${AMIGA}/Disk2/${f}`), f).images.map((m) => m.image);

maybe('The Dark Queen of Krynn — Amiga wall-art feasibility (assessed, not wired)', () => {
  it('the two platforms ship structurally parallel wall containers: equal counts, 47-frame sets', () => {
    for (const [f, sets] of [
      ['8X8DB.TLB', 9],
      ['8X8DC.TLB', 8],
    ] as const) {
      const dos = dosFrames(f);
      const amiga = amigaFrames(f);
      expect(dos.length, `${f} DOS member count`).toBe(sets * FRAMES_PER_SET);
      expect(amiga.length, `${f} Amiga member count`).toBe(sets * FRAMES_PER_SET);
    }

    // The Amiga master's own labels confirm the grouping is real and not just an arithmetic
    // coincidence of 423 = 9 x 47 — every set carries exactly FRAMES_PER_SET members.
    const labels = decodeGlib(read(`${AMIGA}/Disk2/8X8DB.TLB`), '8X8DB.TLB').images.map((m) => m.label);
    const bySet = new Map<string, number>();
    for (const l of labels) {
      const s = /^(set\d+)_/.exec(l)?.[1] ?? '?';
      bySet.set(s, (bySet.get(s) ?? 0) + 1);
    }
    expect([...bySet.keys()].length).toBe(9);
    expect([...bySet.values()].every((n) => n === FRAMES_PER_SET)).toBe(true);
  });

  it('where the Amiga frames decode, per-frame dimensions agree with DOS at shift 0', () => {
    let agree = 0;
    let mismatch = 0;
    let stubs = 0;
    for (const f of ['8X8DB.TLB', '8X8DC.TLB']) {
      const dos = dosFrames(f);
      const amiga = amigaFrames(f);
      for (let i = 0; i < dos.length; i++) {
        if (isStub(amiga[i])) stubs++;
        else if (dos[i].width === amiga[i].width && dos[i].height === amiga[i].height) agree++;
        else mismatch++;
      }
    }
    // 478 of the 494 decodable frames line up. That is the "same geometry, different pixels"
    // signature; a container that had been re-authored for the Amiga would not do this.
    expect(agree).toBe(478);
    expect(mismatch).toBe(16);
    expect(agree / (agree + mismatch)).toBeGreaterThan(0.96);

    // And shift 0 is genuinely the right alignment, not merely the one tried: +/-1 and +2 all score
    // far worse, so the two containers are positionally parallel rather than coincidentally similar.
    const dos = dosFrames('8X8DB.TLB');
    const amiga = amigaFrames('8X8DB.TLB');
    const score = (shift: number) => {
      let n = 0;
      for (let i = 0; i < dos.length; i++) {
        const a = amiga[i + shift];
        if (!a || isStub(a)) continue;
        if (dos[i].width === a.width && dos[i].height === a.height) n++;
      }
      return n;
    };
    expect(score(0)).toBe(245);
    for (const s of [1, -1, 2]) expect(score(s), `shift ${s}`).toBeLessThan(score(0) / 2);
  });

  it('KNOWN GAP: 38% of the Amiga frames do not decode, so the art source is incomplete', () => {
    const stubsFor = (f: string) => amigaFrames(f).filter(isStub).length;
    const b = stubsFor('8X8DB.TLB');
    const c = stubsFor('8X8DC.TLB');
    expect(b).toBe(166);
    expect(c).toBe(139);
    expect((b + c) / (423 + 376)).toBeCloseTo(0.382, 2);

    // The failures are structured, which is the useful lead: within most sets it is ~15 of 47 at a
    // regular stride, but 8X8DB set04 fails ENTIRELY (47/47). A whole set failing while its
    // neighbours mostly succeed points at a per-set codec or plane-depth variant rather than a
    // frame-level edge case, and is the obvious place for a future decoder pass to start.
    const amiga = amigaFrames('8X8DB.TLB');
    const setStubs = (s: number) =>
      amiga.slice(s * FRAMES_PER_SET, (s + 1) * FRAMES_PER_SET).filter(isStub).length;
    expect(setStubs(3), '8X8DB set04 fails entirely').toBe(FRAMES_PER_SET);
    for (const s of [0, 1, 2, 4, 5, 6, 7, 8]) {
      expect(setStubs(s), `8X8DB set0${s + 1} partial`).toBeLessThan(FRAMES_PER_SET);
    }
  });

  it('R4: the 305 stubs split into 76 genuinely-blank-on-both-platforms and 229 Amiga-only', () => {
    // Same 305 as the KNOWN GAP test above, split using the DOS twin as oracle for what each stub
    // position OUGHT to hold. This is new data added by R4 (PLAN-ROUND-31.md) alongside the
    // existing gap, not a replacement for it — the pins above are unchanged because glib.ts is
    // unchanged: no (nplanes, variant) byte-budget hypothesis fits any of these 6-byte bodies
    // against the DOS oracle's real dimensions (see tools/test_glib_frame_census.py). Full
    // arithmetic and per-set table: docs/engine/research/dqk-amiga-glib-frame-variant.md.
    let bothDegenerate = 0;
    let amigaOnly = 0;
    const perFile: Record<string, { bothDegenerate: number; amigaOnly: number }> = {};
    const rightPieceHist = new Map<string, number>();
    const exceptions: string[] = [];
    for (const f of ['8X8DB.TLB', '8X8DC.TLB'] as const) {
      const dos = dosFrames(f);
      const amiga = amigaFrames(f);
      perFile[f] = { bothDegenerate: 0, amigaOnly: 0 };
      for (let i = 0; i < dos.length; i++) {
        if (!isStub(amiga[i])) continue;
        const setIdx = Math.floor(i / FRAMES_PER_SET);
        const rel = i - setIdx * FRAMES_PER_SET;
        if (isStub(dos[i])) {
          bothDegenerate++;
          perFile[f].bothDegenerate++;
          continue;
        }
        amigaOnly++;
        perFile[f].amigaOnly++;
        const piece = pieceOf(rel);
        rightPieceHist.set(piece, (rightPieceHist.get(piece) ?? 0) + 1);
        if (!piece.endsWith('-right')) exceptions.push(`unexpected non-right amiga-only piece: ${f} set${setIdx} ${piece}`);
      }
    }
    expect(exceptions).toEqual([]);
    expect(bothDegenerate).toBe(76);
    expect(amigaOnly).toBe(229);
    expect(perFile['8X8DB.TLB']).toEqual({ bothDegenerate: 47, amigaOnly: 119 });
    expect(perFile['8X8DC.TLB']).toEqual({ bothDegenerate: 29, amigaOnly: 110 });
    expect(Object.fromEntries(rightPieceHist)).toEqual({
      'far-right': 77,
      'mid-right': 77,
      'near-right': 75,
    });

    // The 2 corpus-wide exceptions where the "-right" piece is NOT a stub — the Amiga master
    // stores real, independent art there instead, agreeing with DOS on dimensions. Named by their
    // exact GLOBAL frame index rather than "set + slice", since the 5 near-right positions per
    // set (one per view slice) are not interchangeable and picking the wrong slice would silently
    // check a different, unrelated frame.
    const decodesLikeDos = (f: '8X8DB.TLB' | '8X8DC.TLB', globalIndex: number) => {
      const dos = dosFrames(f);
      const amiga = amigaFrames(f);
      const a = amiga[globalIndex];
      return !isStub(a) && dos[globalIndex].width === a.width && dos[globalIndex].height === a.height;
    };
    // 8X8DB set02 (0-based set index 2), slice at SLICE_AT[2]=20, near-right = +8 -> rel 28.
    expect(decodesLikeDos('8X8DB.TLB', 2 * FRAMES_PER_SET + 28), '8X8DB set02 near-right').toBe(true);
    // 8X8DC set01 (0-based set index 1), slice at SLICE_AT[4]=38, near-right = +8 -> rel 46.
    expect(decodesLikeDos('8X8DC.TLB', 1 * FRAMES_PER_SET + 46), '8X8DC set01 near-right').toBe(true);
  });

  it('DQK wall frames carry their OWN screen placement, so less lives in DQK.EXE than assumed', () => {
    // Refines this file's own earlier reading. HLIB frame headers carry a signed (x,y) origin
    // offset, and DQK's wall frames use it: 186 of 8X8DB.TLB's 423 frames place themselves. Within
    // a set the pattern is a distance-rank vocabulary — a near rank of full-height pieces at (0,0),
    // then successively shorter pieces carrying a positive yOffset that bottom-aligns them against
    // the tall ones (e.g. 16x88 @(0,0), then 16x63 @(0,25), 16x53 @(0,35)).
    //
    // So a future Gen2 wall renderer does NOT have to recover per-frame placement from the
    // executable; what is genuinely missing is narrower — the SELECTION (which frame answers which
    // wall configuration at which viewport slot) and the horizontal column placement, since xOffset
    // is 0 on all but a handful.
    const b = dosFrames('8X8DB.TLB');
    const placed = b.filter((i) => (i.xOffset ?? 0) !== 0 || (i.yOffset ?? 0) !== 0).length;
    expect(placed).toBe(186);
    expect(b.slice(0, 20).every((i) => (i.yOffset ?? 0) === 0), 'near rank sits at origin').toBe(true);
    expect(b.slice(20, 47).every((i) => (i.yOffset ?? 0) > 0), 'far ranks are pushed down').toBe(true);

    // The layout is per-set, NOT one shared template: every set's (dims + offsets) signature is
    // distinct, and 8X8DC's first set places nothing at all while 8X8DB's places 27 of 47. A
    // renderer therefore cannot hard-code one rank table and reuse it for every wall set.
    const signature = (imgs: readonly IndexedImage[], s: number) =>
      imgs
        .slice(s * FRAMES_PER_SET, (s + 1) * FRAMES_PER_SET)
        .map((i) => `${i.width}x${i.height}@${i.xOffset ?? 0},${i.yOffset ?? 0}`)
        .join(' ');
    expect(new Set([...Array(9).keys()].map((s) => signature(b, s))).size).toBe(9);
    const c = dosFrames('8X8DC.TLB');
    expect(new Set([...Array(8).keys()].map((s) => signature(c, s))).size).toBe(8);
    expect(c.slice(0, FRAMES_PER_SET).every((i) => (i.yOffset ?? 0) === 0)).toBe(true);
  });

  it('KNOWN GAP: the Amiga frames come back with no placement at all', () => {
    // A second Amiga-side decoder gap, distinct from the 8x1 stubs. Of the frames that DO decode,
    // 124 report (0,0) where DOS carries a real offset, and none carry an offset DOS lacks — a
    // one-directional loss, which is the signature of the offset fields simply not being read on
    // the GLIB path rather than of the Amiga art being authored differently. Not proven either way
    // here, so it is recorded as an open gap, and it is a second reason the Amiga source is not
    // usable yet even setting aside the missing wall view.
    const dos = dosFrames('8X8DB.TLB');
    const amiga = amigaFrames('8X8DB.TLB');
    let agree = 0;
    let amigaLostOffset = 0;
    let amigaGainedOffset = 0;
    for (let i = 0; i < dos.length; i++) {
      const a = amiga[i];
      if (isStub(a)) continue;
      const d0 = (dos[i].xOffset ?? 0) === 0 && (dos[i].yOffset ?? 0) === 0;
      const a0 = (a.xOffset ?? 0) === 0 && (a.yOffset ?? 0) === 0;
      if ((dos[i].xOffset ?? 0) === (a.xOffset ?? 0) && (dos[i].yOffset ?? 0) === (a.yOffset ?? 0)) agree++;
      else if (!d0 && a0) amigaLostOffset++;
      else if (d0 && !a0) amigaGainedOffset++;
    }
    expect(agree).toBe(133);
    expect(amigaLostOffset).toBe(124);
    expect(amigaGainedOffset, 'loss is one-directional').toBe(0);
  });

  it('a 47-frame set is 5 view slices of Gen1 wall pieces plus 2 caps, in Gen1 PIECES order', () => {
    // The remaining unknown after the placement test above was frame SELECTION: which member
    // answers which wall slot. It turns out DQK did not invent a new vocabulary — a set decomposes
    // as cap+9, cap+9, 9, 9, 9 = 47, and each 9-run is `world/wallpieces.ts`'s PIECES order with
    // the far-cap lifted out to the front of the run:
    //
    //   far-front, far-left, far-right, mid-front, mid-left, mid-right, near-front, near-left, near-right
    //
    // Widths are Gen1's nominal rectangle widths, EXCEPT near-front, which is the piece whose
    // painted extent varies most by wall variant. So it is left as a wildcard here and its
    // observed vocabulary asserted separately.
    let sets = 0;
    let capsOk = 0;
    let slices = 0;
    let stubFree = 0;
    let widthNominal = 0;
    const nearFrontW = new Map<number, number>();
    for (const [f, n] of [
      ['8X8DB.TLB', 9],
      ['8X8DC.TLB', 8],
    ] as const) {
      const imgs = dosFrames(f);
      for (let s = 0; s < n; s++) {
        const set = imgs.slice(s * FRAMES_PER_SET, (s + 1) * FRAMES_PER_SET);
        sets++;
        // The two caps sit at set-relative 0 and 10, i.e. at the FRONT of the first two runs.
        if (set[0].width === 8 && set[10].width === 8) capsOk++;
        for (const a of SLICE_AT) {
          slices++;
          const run = set.slice(a, a + 9);
          if (run.some(isStub)) continue; // the §KNOWN GAP stubs above, not a model failure
          stubFree++;
          const w = run.map((i) => i.width);
          nearFrontW.set(w[6], (nearFrontW.get(w[6]) ?? 0) + 1);
          if (NOMINAL_W.every((v, k) => v === null || v === w[k])) widthNominal++;
        }
      }
    }
    expect(sets).toBe(17);
    expect(capsOk, 'every set caps at relative 0 and 10').toBe(17);
    expect(slices).toBe(85);
    expect(stubFree, 'the 8 skipped slices are the Amiga-independent DOS stub frames').toBe(77);

    // 72 of 77 match the nominal width signature outright. The 5 that do not shrink INDIVIDUAL
    // pieces (mid-front 24->8, near-left/right 16->8) rather than reordering them — DQK crops each
    // piece to its painted extent and relies on the header offsets to place it, which is exactly
    // what the placement test above found. So these are narrow wall variants, not a broken model.
    expect(widthNominal).toBe(72);
    expect([...nearFrontW].sort((a, b) => a[0] - b[0])).toEqual([
      [24, 1],
      [32, 2],
      [40, 17],
      [48, 4],
      [56, 53],
    ]);
  });

  it('the piece ORDER within a slice is confirmed independently of width, by depth ordering', () => {
    // The width signature above could in principle be satisfied by a different permutation that
    // happens to share widths (the three 8s, the two 16s). Heights break that tie without using
    // width at all: in a first-person view the far rank is drawn shortest and the near rank
    // tallest, and left/right at one depth are mirrors of each other, so their heights match.
    let runs = 0;
    let depthOrdered = 0;
    let pairSymmetric = 0;
    for (const [f, n] of [
      ['8X8DB.TLB', 9],
      ['8X8DC.TLB', 8],
    ] as const) {
      const imgs = dosFrames(f);
      for (let s = 0; s < n; s++) {
        const set = imgs.slice(s * FRAMES_PER_SET, (s + 1) * FRAMES_PER_SET);
        for (const a of SLICE_AT) {
          const run = set.slice(a, a + 9);
          if (run.some(isStub)) continue;
          runs++;
          const h = run.map((i) => i.height);
          const far = Math.max(h[0], h[1], h[2]);
          const mid = Math.max(h[3], h[4], h[5]);
          const near = Math.max(h[6], h[7], h[8]);
          if (far < mid && mid < near) depthOrdered++;
          const close = (x: number, y: number) => Math.abs(x - y) <= 2;
          if (close(h[1], h[2]) && close(h[4], h[5]) && close(h[7], h[8])) pairSymmetric++;
        }
      }
    }
    expect(runs).toBe(77);
    // 74/77 and 75/77. The handful of exceptions are near-ties (one rank 1px under its neighbour),
    // not rank swaps, so they do not contradict the ordering — but they are asserted exactly rather
    // than rounded to a ratio, so a real regression cannot hide inside a threshold.
    expect(depthOrdered).toBe(74);
    expect(pairSymmetric).toBe(75);
  });

  it('DQK has no WALLDEF file on either platform, so the Pools/Gateway proof is unavailable', () => {
    // A "this file is absent" assertion passes for free if the base path is wrong, so anchor both
    // roots on files that must be PRESENT before claiming anything is missing.
    for (const p of [`${DOS}/DISK2/8X8DB.TLB`, `${DOS}/DISK3/GEO.GLB`, `${DOS}/DISK1/ALWAYS.TLB`]) {
      expect(existsSync(p), `anchor ${p}`).toBe(true);
    }
    for (const p of [`${AMIGA}/Disk2/8X8DB.TLB`, `${AMIGA}/Disk3/GEO.GLB`, `${AMIGA}/Disk1/ALWAYS.TLB`]) {
      expect(existsSync(p), `anchor ${p}`).toBe(true);
    }

    for (const dir of ['DISK1', 'DISK2', 'DISK3']) {
      for (const name of ['WALLDEF.DAX', 'WALLDEF.GLB', 'WALLDEF.TLB', 'WallDef.glb']) {
        expect(existsSync(`${DOS}/${dir}/${name}`), `${dir}/${name}`).toBe(false);
      }
    }
    for (const dir of ['Disk1', 'Disk2', 'Disk3']) {
      for (const name of ['WALLDEF.GLB', 'WallDef.glb', 'WALLDEF.DAX']) {
        expect(existsSync(`${AMIGA}/${dir}/${name}`), `amiga ${dir}/${name}`).toBe(false);
      }
    }
  });
});
