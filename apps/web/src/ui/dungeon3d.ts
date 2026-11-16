/**
 * 3D dungeon view (lazy chunk) -- docs/engine/web-dungeon-3d-spec.md section 2.
 *
 * Renders the renderer-neutral wall mesh from `@goldbox/engine`'s `buildDungeonMesh` in a hand-written
 * WebGL2 painter, with a Canvas2D painter (same mesh, same colours, same culling) as the guaranteed
 * fallback. No new dependency. The mesh is built from the same GEO planes the 2D first-person view
 * reads, with DIRECTED per-side quads and mandatory back-face culling, so a one-way edge is invisible
 * from the open neighbour exactly as in 2D.
 *
 * Honest v1 limits (also shown in the status line):
 *  - flat slot colours only: no wall textures harvested yet (spec 2.5 is an unprototyped step), so the
 *    status line reports "textured 0/N, N flat" and "platform: DOS geometry, flat colour (v1)".
 *  - Gen1 DAX GEO and DQK GEO.GLB only. Amiga GLIB GEO has no TS map decode yet.
 *  - the minimap is a small purpose-built canvas, not `composeAutomapPanel`; no fog-of-war toggle.
 *
 * `window.__dungeon3d` is the e2e seam; `key()` dispatches a real keydown on `window` so key handling
 * goes through exactly the code a user's keypress takes.
 */
import {
  buildDungeonMesh,
  decodeGeoBlock,
  decodeGen2GeoArchive,
  decodeHlib,
  eclBlockIdForGeoArea,
  frontFaceRequests,
  isBackFacing,
  looksOverland,
  meshWallSet,
  pickDefaultStart,
  readDaxDataBlocks,
  stepTarget,
} from '@goldbox/engine';
import type { Direction, DungeonMesh, DungeonWallQuad, GameMap, Topology } from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { GEN1_BASE_GAMES } from './gen1Disks.js';
import type { Gen1BaseGameId } from './gen1Disks.js';
import { DUNGEON3D_TITLES, setDungeon3dCloser } from './dungeon3dHost.js';

const DQK_GEO_GLB = 'The Dark Queen of Krynn/DISK3/GEO.GLB';

type Vec3 = readonly [number, number, number];
const DIRS: readonly Direction[] = ['north', 'east', 'south', 'west'];
const OPP: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };
const HALF_PI = Math.PI / 2;
const FOV = (70 * Math.PI) / 180;
const NEAR = 0.05;
const FAR = 48;
const VIEW_RADIUS = 12;

// ---------------------------------------------------------------------------------------------
// Titles and map loading
// ---------------------------------------------------------------------------------------------

export { DUNGEON3D_TITLES };

interface MapEntry {
  /** "disk:id" for Gen1, "id" for DQK. */
  key: string;
  label: string;
  map: GameMap;
  overland: boolean;
  /** The ECL block id the 2D view would use for this area (its ECL partner), or null when it has none. */
  eclBlockId: number | null;
  mesh: DungeonMesh | null;
  mostlyOpen: boolean;
}

async function readBytes(path: string, src?: AssetSource): Promise<Uint8Array | null> {
  try {
    if (src) return await src.readAsset(basenameOf(path));
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    // The dev server answers a missing game file with its own index.html (HTTP 200).
    if (/^text\/html\b/i.test(resp.headers.get('content-type') ?? '')) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

function describe(entry: Omit<MapEntry, 'label' | 'mostlyOpen'>, prefix: string): MapEntry {
  const s = entry.mesh?.stats;
  // Open-world note: any map whose grid edge is mostly open is probably an overland map.
  const boundaryCount = entry.mesh ? 2 * (entry.mesh.width + entry.mesh.height) : 0;
  const mostlyOpen = !!s && boundaryCount > 0 && s.openBoundary / boundaryCount > 0.25;
  const label = entry.overland
    ? `${prefix} - overland map (no ECL partner, mostly open edge), 3D not offered`
    : `${prefix} - walls ${s?.walls ?? 0}, one-way ${s?.oneWay ?? 0}, slot-mismatch ${s?.slotMismatch ?? 0}, open edge ${s?.openBoundary ?? 0}${mostlyOpen ? ' (mostly open edge - may be an overland map)' : ''}`;
  return { ...entry, label, mostlyOpen };
}

const mapCache = new Map<string, Promise<MapEntry[]>>();

async function loadTitleMaps(titleId: string, src?: AssetSource): Promise<MapEntry[]> {
  const cacheKey = src ? null : titleId;
  if (cacheKey) {
    const hit = mapCache.get(cacheKey);
    if (hit) return hit;
  }
  const p = (async (): Promise<MapEntry[]> => {
    const out: MapEntry[] = [];
    if (titleId === 'dqk') {
      const bytes = await readBytes(DQK_GEO_GLB, src);
      if (!bytes) return out;
      try {
        const arch = decodeHlib(bytes, 'GEO.GLB');
        for (const m of decodeGen2GeoArchive(arch.rawMembers, 'GEO')) {
          // Gen2 areas are GEO.GLB members, not ECL blocks: there is no ECL block id, topology is explicit.
          const mesh = buildDungeonMesh(m.map, { topology: 'bounded' });
          out.push(describe({ key: String(m.id), map: m.map, overland: false, eclBlockId: null, mesh }, `area ${m.id} (${m.map.width}x${m.map.height})`));
        }
      } catch { /* garbage bytes: no maps */ }
      return out.sort((a, b) => Number(a.key) - Number(b.key));
    }
    const base = GEN1_BASE_GAMES[titleId as Gen1BaseGameId];
    if (!base) return out;
    for (const disk of base.disks) {
      const bytes = await readBytes(disk.geoPath, src);
      if (!bytes) continue;
      let blocks;
      try { blocks = readDaxDataBlocks(bytes); } catch { continue; }
      // The disk's ECL archive says which GEO maps are real areas (a GEO block N + ECL block N pair).
      // Unreadable (for example a Library folder without it): null => assume the pairing convention.
      let eclIds: Set<number> | null = null;
      const eclBytes = await readBytes(disk.eclPath, src);
      if (eclBytes) { try { eclIds = new Set(readDaxDataBlocks(eclBytes).map((e) => e.blockId)); } catch { eclIds = null; } }
      for (const b of blocks) {
        if (b.raw.length !== 1026) continue;
        let map: GameMap;
        try { map = decodeGeoBlock(b.raw, `GEO${disk.disk}#${b.blockId}`).map; } catch { continue; }
        // `eclBlockId` is the ECL block of this area's ECL partner (ids 0/10 => open off-map reads in 2D),
        // never the bare GEO id: a GEO map without an ECL partner has none.
        const eclBlockId = eclBlockIdForGeoArea(b.blockId, eclIds);
        const full = buildDungeonMesh(map, { eclBlockId, rejectOverland: false })!;
        // Per-map, evidence-based (no whole-file hint): an UNPAIRED map with a mostly-open edge is a
        // wilderness sheet. Paired maps (towns, cities) only carry the "mostly open edge" note.
        const overland = looksOverland(full.stats, full.width, full.height, eclIds === null || eclIds.has(b.blockId));
        out.push(describe({ key: `${disk.disk}:${b.blockId}`, map, overland, eclBlockId: eclBlockId ?? null, mesh: overland ? null : full }, `disk ${disk.disk} - area ${b.blockId}`));
      }
    }
    return out;
  })();
  if (cacheKey) mapCache.set(cacheKey, p);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

type RGBA = [number, number, number, number];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const FACE_SHADE: Record<string, number> = { north: 0.8, east: 0.65, south: 1.0, west: 0.75 };
const DOOR_TINT: Record<number, [number, number, number]> = { 1: [0.6, 0.38, 0.16], 2: [0.3, 0.42, 0.85], 3: [0.82, 0.14, 0.14] };

function wallColour(q: DungeonWallQuad, slotColours: boolean): RGBA {
  const base = slotColours ? hslToRgb((q.slot * 47) % 360, 0.35, 0.45) : ([0.55, 0.55, 0.55] as [number, number, number]);
  const shade = FACE_SHADE[q.face] ?? 0.8;
  let c: [number, number, number] = [base[0] * shade, base[1] * shade, base[2] * shade];
  const tint = DOOR_TINT[q.door];
  if (tint) c = [c[0] * 0.5 + tint[0] * 0.5, c[1] * 0.5 + tint[1] * 0.5, c[2] * 0.5 + tint[2] * 0.5];
  return [c[0], c[1], c[2], q.doorState === 'open' ? 0.5 : 1];
}

const FLOOR_INDOOR: RGBA = [0.28, 0.25, 0.22, 1];
const FLOOR_OUTDOOR: RGBA = [0.22, 0.38, 0.2, 1];
const CEILING: RGBA = [0.17, 0.17, 0.22, 1];
const SKY: RGBA = [0.1, 0.13, 0.2, 1];
const MARKER: RGBA = [0.95, 0.6, 0.15, 0.55];
const TOP_EDGE: RGBA = [1, 0.93, 0.67, 1];

function css(c: RGBA, fog = 1, alpha = c[3]): string {
  const r = Math.round(Math.min(1, c[0] * fog) * 255);
  const g = Math.round(Math.min(1, c[1] * fog) * 255);
  const b = Math.round(Math.min(1, c[2] * fog) * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

const fogOf = (dist: number): number => Math.max(0.25, Math.min(1, 1 - dist / 16));

// ---------------------------------------------------------------------------------------------
// Camera math
// ---------------------------------------------------------------------------------------------

interface Cam { ex: number; ey: number; ez: number; yaw: number; pitch: number }
interface Basis { r: Vec3; u: Vec3; f: Vec3 }

function basisOf(c: Cam): Basis {
  const cp = Math.cos(c.pitch);
  const f: Vec3 = [Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp];
  const r: Vec3 = [Math.cos(c.yaw), 0, Math.sin(c.yaw)];
  const u: Vec3 = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
  return { r, u, f };
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function viewProj(c: Cam, aspect: number): Float32Array {
  const { r, u, f } = basisOf(c);
  const v = new Float32Array([
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -(r[0] * c.ex + r[1] * c.ey + r[2] * c.ez),
    -(u[0] * c.ex + u[1] * c.ey + u[2] * c.ez),
    f[0] * c.ex + f[1] * c.ey + f[2] * c.ez,
    1,
  ]);
  const t = 1 / Math.tan(FOV / 2);
  const p = new Float32Array([
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (FAR + NEAR) / (NEAR - FAR), -1,
    0, 0, (2 * FAR * NEAR) / (NEAR - FAR), 0,
  ]);
  return mat4Mul(p, v);
}

/** Project a world polygon to screen space with near-plane clipping; null when fully behind. */
function projectPoly(pts: readonly Vec3[], c: Cam, b: Basis, W: number, H: number): [number, number][] | null {
  const cs: Vec3[] = pts.map((p) => {
    const dx = p[0] - c.ex; const dy = p[1] - c.ey; const dz = p[2] - c.ez;
    return [
      dx * b.r[0] + dy * b.r[1] + dz * b.r[2],
      dx * b.u[0] + dy * b.u[1] + dz * b.u[2],
      dx * b.f[0] + dy * b.f[1] + dz * b.f[2],
    ] as const;
  });
  const clipped: Vec3[] = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i]!; const n = cs[(i + 1) % cs.length]!;
    const aIn = a[2] >= NEAR; const nIn = n[2] >= NEAR;
    if (aIn) clipped.push(a);
    if (aIn !== nIn) {
      const t = (NEAR - a[2]) / (n[2] - a[2]);
      clipped.push([a[0] + (n[0] - a[0]) * t, a[1] + (n[1] - a[1]) * t, NEAR] as const);
    }
  }
  if (clipped.length < 3) return null;
  const k = H / 2 / Math.tan(FOV / 2);
  return clipped.map((p) => [W / 2 + (p[0] / p[2]) * k, H / 2 - (p[1] / p[2]) * k] as [number, number]);
}

// ---------------------------------------------------------------------------------------------
// WebGL2 painter
// ---------------------------------------------------------------------------------------------

const VERT = `#version 300 es
in vec3 a_pos; in vec4 a_col;
uniform mat4 u_vp; uniform vec3 u_off; uniform vec3 u_eye; uniform float u_fog;
out vec4 v_col; out float v_fog;
void main(){
  vec3 w = a_pos + u_off;
  gl_Position = u_vp * vec4(w, 1.0);
  v_col = a_col;
  v_fog = u_fog > 0.5 ? clamp(1.0 - length(w - u_eye) / 16.0, 0.25, 1.0) : 1.0;
}`;
const FRAG = `#version 300 es
precision mediump float;
in vec4 v_col; in float v_fog; out vec4 o;
void main(){ o = vec4(v_col.rgb * v_fog, v_col.a); }`;

interface GlBuf { buf: WebGLBuffer; count: number }
interface GlState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uVp: WebGLUniformLocation;
  uOff: WebGLUniformLocation;
  uEye: WebGLUniformLocation;
  uFog: WebGLUniformLocation;
  walls: GlBuf | null;
  open: GlBuf | null;
  flats: GlBuf | null;
  markers: GlBuf | null;
  /** Wall top edges (GL_LINES), drawn in orbit mode regardless of culling. */
  tops: GlBuf | null;
  loseExt: WEBGL_lose_context | null;
}

/** Append one quad as two triangles (0,1,2)(0,2,3): CCW stays CCW. */
function pushQuad(out: number[], corners: readonly Vec3[], c: RGBA): void {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const p = corners[i]!;
    out.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]);
  }
}

// ---------------------------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------------------------

type Mode = 'walk' | 'orbit';
type RendererKind = 'webgl2' | 'canvas2d';

interface View {
  seq: number;
  gameId: string;
  rendererPref: 'auto' | RendererKind;
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  mini: HTMLCanvasElement;
  /** The status line, shown ONCE in the app header (`#status`); kept here for the seam. */
  statusText: string;
  titleSel: HTMLSelectElement;
  areaSel: HTMLSelectElement;
  renderer: RendererKind;
  rendererReason: string;
  ctx2d: CanvasRenderingContext2D | null;
  gl: GlState | null;
  glLost: boolean;
  lostTimer: number;
  maps: MapEntry[];
  entry: MapEntry | null;
  mesh: DungeonMesh | null;
  byCell: DungeonWallQuad[][];
  floorAt: Map<number, DungeonMesh['floors'][number]>;
  ceilAt: Map<number, DungeonMesh['ceilings'][number]>;
  topology: Topology;
  mode: Mode;
  allowLocked: boolean;
  ceilings: boolean;
  slotColours: boolean;
  showMini: boolean;
  /** Walk pose (cell + facing 0..3) and the float camera (unwrapped under torus). */
  px: number; py: number; pf: number;
  cam: Cam;
  anim: { t0: number; dur: number; from: Cam; to: Cam } | null;
  orbit: { tx: number; tz: number; dist: number; yaw: number; pitch: number };
  dirty: boolean;
  raf: number;
  note: string;
  /** '' when a map is shown; otherwise why none is ('no-maps' | 'overland-only'). */
  emptyReason: '' | 'no-maps' | 'overland-only';
  cleanups: (() => void)[];
  size: { w: number; h: number; dpr: number };
}

let V: View | null = null;
let mountSeq = 0;

const dirName = (f: number): Direction => DIRS[((f % 4) + 4) % 4]!;
const mod = (n: number, m: number): number => ((n % m) + m) % m;

function buildIndexes(v: View): void {
  const m = v.mesh;
  v.byCell = [];
  v.floorAt = new Map();
  v.ceilAt = new Map();
  if (!m) return;
  v.byCell = Array.from({ length: m.width * m.height }, () => [] as DungeonWallQuad[]);
  for (const q of m.walls) v.byCell[q.y * m.width + q.x]!.push(q);
  for (const f of m.floors) v.floorAt.set(f.y * m.width + f.x, f);
  for (const c of m.ceilings) v.ceilAt.set(c.y * m.width + c.x, c);
}

function walkCam(x: number, y: number, yaw: number): Cam {
  return { ex: x + 0.5, ey: 0.5, ez: y + 0.5, yaw, pitch: 0 };
}

/** Frame the whole map from above-and-behind: target = map centre, distance fits the larger side. */
function frameOrbit(v: View, pitch = 1.0): void {
  const m = v.entry?.map;
  if (!m) return;
  const half = Math.max(m.width, m.height) / 2;
  // vertical FOV 70 deg and ~1.6 aspect: distance so the larger half-side (plus a margin) fits.
  v.orbit = { tx: m.width / 2, tz: m.height / 2, dist: Math.max(4, (half * 1.25) / Math.tan(FOV / 2) + half * 0.6), yaw: 0, pitch };
}

function orbitCam(v: View): Cam {
  const o = v.orbit;
  const cp = Math.cos(o.pitch);
  const f: Vec3 = [Math.sin(o.yaw) * cp, Math.sin(o.pitch), -Math.cos(o.yaw) * cp];
  return { ex: o.tx - f[0] * o.dist, ey: 0.3 - f[1] * o.dist, ez: o.tz - f[2] * o.dist, yaw: o.yaw, pitch: o.pitch };
}

function currentCam(v: View): Cam {
  if (v.mode === 'orbit') return orbitCam(v);
  if (!v.anim) return v.cam;
  const t = Math.min(1, (performance.now() - v.anim.t0) / v.anim.dur);
  const e = t * t * (3 - 2 * t);
  const a = v.anim.from; const b = v.anim.to;
  return {
    ex: a.ex + (b.ex - a.ex) * e, ey: b.ey, ez: a.ez + (b.ez - a.ez) * e,
    yaw: a.yaw + (b.yaw - a.yaw) * e, pitch: 0,
  };
}

function settle(v: View): void {
  if (!v.anim) return;
  v.cam = v.anim.to;
  v.anim = null;
  const m = v.mesh;
  if (m && v.topology === 'torus') {
    // Pose stays the in-grid cell; the float camera is re-based into the grid so it never drifts.
    v.cam = { ...v.cam, ex: mod(v.cam.ex - 0.5, m.width) + 0.5, ez: mod(v.cam.ez - 0.5, m.height) + 0.5 };
  }
  v.dirty = true;
}

function beginAnim(v: View, to: Cam): void {
  settle(v);
  v.anim = { t0: performance.now(), dur: 150, from: v.cam, to };
  schedule(v);
}

// ---------------------------------------------------------------------------------------------
// Map selection and movement
// ---------------------------------------------------------------------------------------------

function selectEntry(v: View, entry: MapEntry): boolean {
  if (!entry.mesh) { v.note = 'This map is flagged overland; 3D is not offered.'; return false; }
  v.entry = entry;
  v.mesh = entry.mesh;
  v.topology = entry.mesh.topology;
  buildIndexes(v);
  // Default start: the pose with the most to look at (deterministic, engine `pickDefaultStart`).
  const s = pickDefaultStart(entry.map, v.topology);
  v.px = s.x; v.py = s.y; v.pf = s.facing;
  v.anim = null;
  v.cam = walkCam(s.x, s.y, s.facing * HALF_PI);
  frameOrbit(v);
  rebuildGl(v);
  v.note = '';
  v.dirty = true;
  if (v.areaSel.value !== entry.key) v.areaSel.value = entry.key;
  syncUrl(v);
  updateStatus(v);
  schedule(v);
  return true;
}

function syncUrl(v: View): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('dungeon3d', v.gameId);
    if (v.entry) u.searchParams.set('area', v.entry.key);
    window.history.replaceState(null, '', u.toString());
  } catch { /* not fatal */ }
}

const DX: Record<Direction, number> = { north: 0, east: 1, south: 0, west: -1 };
const DY: Record<Direction, number> = { north: -1, east: 0, south: 1, west: 0 };

/** Move one cell toward `dir` through the shared engine predicate. Returns whether the pose changed. */
function walkStep(v: View, dir: Direction): boolean {
  if (v.mode !== 'walk' || !v.entry || !v.mesh) return false;
  settle(v);
  const t = stepTarget(v.entry.map, v.px, v.py, dir, v.topology, { allowLocked: v.allowLocked });
  if (!t) { v.note = `Blocked: ${dir}`; updateStatus(v); return false; }
  v.note = '';
  const to: Cam = { ...v.cam, ex: v.cam.ex + DX[dir], ez: v.cam.ez + DY[dir] };
  v.px = t.x; v.py = t.y;
  beginAnim(v, to);
  updateStatus(v);
  return true;
}

function walkTurn(v: View, d: 1 | -1): void {
  if (v.mode !== 'walk') return;
  settle(v);
  v.pf = mod(v.pf + d, 4);
  beginAnim(v, { ...v.cam, yaw: v.cam.yaw + d * HALF_PI });
  updateStatus(v);
}

function setMode(v: View, mode: Mode): void {
  if (v.mode === mode) return;
  settle(v);
  v.mode = mode;
  if (mode === 'orbit') frameOrbit(v);
  v.dirty = true;
  updateStatus(v);
  schedule(v);
}

function setPose(v: View, x: number, y: number, f: number): void {
  if (!v.entry) return;
  settle(v);
  const m = v.entry.map;
  // `f` uses the seam's facing convention: 0/2/4/6 = N/E/S/W.
  v.px = mod(Math.trunc(x), m.width); v.py = mod(Math.trunc(y), m.height); v.pf = mod(Math.trunc(f / 2), 4);
  v.cam = walkCam(v.px, v.py, v.pf * HALF_PI);
  v.dirty = true;
  updateStatus(v);
  schedule(v);
}

function onKey(v: View, e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && /^(SELECT|INPUT|TEXTAREA)$/.test(t.tagName)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let handled = true;
  if (k === 'Escape') { closeDungeon3d(); return; }
  if (k === 'c') setMode(v, v.mode === 'walk' ? 'orbit' : 'walk');
  else if (k === 'm') { v.showMini = !v.showMini; v.mini.style.display = v.showMini ? 'block' : 'none'; drawMini(v); }
  else if (k === 'l') { v.ceilings = !v.ceilings; v.dirty = true; }
  else if (k === 't') { v.slotColours = !v.slotColours; rebuildGl(v); v.dirty = true; }
  else if (k === 'k') { v.allowLocked = !v.allowLocked; v.note = v.allowLocked ? 'Passing locked doors: ON' : 'Passing locked doors: OFF'; }
  else if (k === 'f') { setMode(v, 'orbit'); frameOrbit(v, 1.5); v.dirty = true; }
  else if (v.mode === 'walk') {
    if (k === 'ArrowUp' || k === 'w') walkStep(v, dirName(v.pf));
    else if (k === 'ArrowDown' || k === 's') walkStep(v, dirName(v.pf + 2));
    else if (k === 'ArrowLeft') walkTurn(v, -1);
    else if (k === 'ArrowRight') walkTurn(v, 1);
    else if (k === 'q' || k === 'a') walkStep(v, dirName(v.pf + 3));
    else if (k === 'e' || k === 'd') walkStep(v, dirName(v.pf + 1));
    else handled = false;
  } else {
    const o = v.orbit;
    const fwdX = Math.sin(o.yaw); const fwdZ = -Math.cos(o.yaw);
    const rX = Math.cos(o.yaw); const rZ = Math.sin(o.yaw);
    if (k === 'ArrowLeft') o.yaw -= 0.15;
    else if (k === 'ArrowRight') o.yaw += 0.15;
    else if (k === 'ArrowUp') o.pitch = Math.min(1.5, o.pitch + 0.1);
    else if (k === 'ArrowDown') o.pitch = Math.max(-0.2, o.pitch - 0.1);
    else if (k === 'w') { o.tx += fwdX * 0.5; o.tz += fwdZ * 0.5; }
    else if (k === 's') { o.tx -= fwdX * 0.5; o.tz -= fwdZ * 0.5; }
    else if (k === 'a') { o.tx -= rX * 0.5; o.tz -= rZ * 0.5; }
    else if (k === 'd') { o.tx += rX * 0.5; o.tz += rZ * 0.5; }
    else if (k === '+' || k === '=') o.dist = Math.max(1.5, o.dist * 0.85);
    else if (k === '-') o.dist = Math.min(60, o.dist / 0.85);
    else handled = false;
    if (handled) v.dirty = true;
  }
  if (handled) { e.preventDefault(); updateStatus(v); schedule(v); }
}

// ---------------------------------------------------------------------------------------------
// WebGL setup / teardown
// ---------------------------------------------------------------------------------------------

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error('createShader failed');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader compile: ${gl.getShaderInfoLog(s) ?? '?'}`);
  return s;
}

function createGl(canvas: HTMLCanvasElement): GlState {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL2 context unavailable');
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram failed');
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_pos'); gl.bindAttribLocation(prog, 1, 'a_col');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`program link: ${gl.getProgramInfoLog(prog) ?? '?'}`);
  gl.deleteShader(vs); gl.deleteShader(fs);
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('createVertexArray failed');
  const uVp = gl.getUniformLocation(prog, 'u_vp'); const uOff = gl.getUniformLocation(prog, 'u_off'); const uEye = gl.getUniformLocation(prog, 'u_eye'); const uFog = gl.getUniformLocation(prog, 'u_fog');
  if (!uVp || !uOff || !uEye || !uFog) throw new Error('uniform lookup failed');
  const err = gl.getError();
  if (err !== 0) throw new Error(`GL error ${err} during setup`);
  return { gl, prog, vao, uVp, uOff, uEye, uFog, walls: null, open: null, flats: null, markers: null, tops: null, loseExt: gl.getExtension('WEBGL_lose_context') };
}

function uploadBuf(g: GlState, data: number[]): GlBuf | null {
  if (data.length === 0) return null;
  const buf = g.gl.createBuffer();
  if (!buf) return null;
  g.gl.bindBuffer(g.gl.ARRAY_BUFFER, buf);
  g.gl.bufferData(g.gl.ARRAY_BUFFER, new Float32Array(data), g.gl.STATIC_DRAW);
  return { buf, count: data.length / 7 };
}

function freeBufs(g: GlState): void {
  for (const k of ['walls', 'open', 'flats', 'markers', 'tops'] as const) {
    const b = g[k];
    if (b) g.gl.deleteBuffer(b.buf);
    g[k] = null;
  }
}

/** (Re)build the GL vertex buffers from the current mesh. No-op without a live GL renderer. */
function rebuildGl(v: View): void {
  const g = v.gl;
  if (!g || v.glLost || !v.mesh) return;
  freeBufs(g);
  const solid: number[] = []; const open: number[] = []; const flats: number[] = []; const markers: number[] = []; const tops: number[] = [];
  for (const q of v.mesh.walls) {
    const c = wallColour(q, v.slotColours);
    pushQuad(c[3] < 1 ? open : solid, q.corners, c);
    for (const i of [3, 2]) { const p = q.corners[i]!; tops.push(p[0], p[1], p[2], TOP_EDGE[0], TOP_EDGE[1], TOP_EDGE[2], 1); }
  }
  for (const f of v.mesh.floors) pushQuad(flats, f.corners, f.outdoor ? FLOOR_OUTDOOR : FLOOR_INDOOR);
  v.mesh.ceilings.forEach((c) => pushQuad(flats, [...c.corners].reverse(), CEILING));
  for (const d of v.mesh.doorsOnOpen) {
    const x = d.x; const y = d.y; const h = 0.5;
    const pts: Record<Direction, Vec3[]> = {
      north: [[x, 0, y], [x + 1, 0, y], [x + 1, h, y], [x, h, y]],
      south: [[x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, h, y + 1], [x, h, y + 1]],
      west: [[x, 0, y], [x, 0, y + 1], [x, h, y + 1], [x, h, y]],
      east: [[x + 1, 0, y], [x + 1, 0, y + 1], [x + 1, h, y + 1], [x + 1, h, y]],
    };
    pushQuad(markers, pts[d.side], MARKER);
  }
  g.walls = uploadBuf(g, solid);
  g.open = uploadBuf(g, open);
  // The ceilings share a buffer with floors; they are drawn only when enabled, so keep them apart.
  g.flats = uploadBuf(g, flats);
  g.markers = uploadBuf(g, markers);
  g.tops = uploadBuf(g, tops);
}

function drawBuf(g: GlState, b: GlBuf | null, first = 0, count = -1, mode?: number): void {
  if (!b) return;
  const gl = g.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.drawArrays(mode ?? gl.TRIANGLES, first, count < 0 ? b.count : count);
}

function drawGl(v: View, cam: Cam): void {
  const g = v.gl; const m = v.mesh;
  if (!g || !m || v.glLost) return;
  const gl = g.gl;
  gl.viewport(0, 0, v.canvas.width, v.canvas.height);
  gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(g.prog);
  gl.bindVertexArray(g.vao);
  const vp = viewProj(cam, v.canvas.width / Math.max(1, v.canvas.height));
  gl.uniformMatrix4fv(g.uVp, false, vp);
  gl.uniform3f(g.uEye, cam.ex, cam.ey, cam.ez);
  gl.uniform1f(g.uFog, v.mode === 'orbit' ? 0 : 1);
  const offsets: [number, number][] = [];
  if (v.topology === 'torus') {
    const bx = Math.floor(cam.ex / m.width) * m.width; const bz = Math.floor(cam.ez / m.height) * m.height;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) offsets.push([bx + i * m.width, bz + j * m.height]);
  } else offsets.push([0, 0]);
  // Floors (and, indoors in walk mode, ceilings) are two-sided; every wall draw culls back faces.
  const floorVerts = m.floors.length * 6;
  for (const [ox, oz] of offsets) {
    gl.uniform3f(g.uOff, ox, 0, oz);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    if (g.flats) drawBuf(g, g.flats, 0, v.ceilings && v.mode === 'walk' ? -1 : floorVerts);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    drawBuf(g, g.walls);
    // Orbit aid: wall top edges, culled faces or not (mirrors the Canvas2D painter).
    if (v.mode === 'orbit') { gl.disable(gl.CULL_FACE); drawBuf(g, g.tops, 0, -1, gl.LINES); }
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  for (const [ox, oz] of offsets) {
    gl.uniform3f(g.uOff, ox, 0, oz);
    gl.enable(gl.CULL_FACE);
    drawBuf(g, g.open);
    gl.disable(gl.CULL_FACE);
    drawBuf(g, g.markers);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

// ---------------------------------------------------------------------------------------------
// Canvas2D painter
// ---------------------------------------------------------------------------------------------

function drawPoly(ctx: CanvasRenderingContext2D, poly: [number, number][], fill: string, stroke: string | null): void {
  ctx.beginPath();
  ctx.moveTo(poly[0]![0], poly[0]![1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]![0], poly[i]![1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function shift(corners: readonly Vec3[], ox: number, oz: number): Vec3[] {
  return corners.map((p) => [p[0] + ox, p[1], p[2] + oz] as const);
}

function drawCanvas2d(v: View, cam: Cam): void {
  const ctx = v.ctx2d; const m = v.mesh;
  if (!ctx || !m) return;
  const W = v.canvas.width; const H = v.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = css(SKY);
  ctx.fillRect(0, 0, W, H);
  const b = basisOf(cam);
  const ccx = Math.floor(cam.ex); const ccz = Math.floor(cam.ez);
  const torus = v.topology === 'torus';
  // Gather every visible cell in range, mapping virtual cells onto the real grid (torus) or skipping.
  const flat: { poly: [number, number][]; fill: string }[] = [];
  const walls: { d: number; poly: [number, number][]; fill: string; stroke: string }[] = [];
  const over: { poly: [number, number][]; fill: string }[] = [];
  const tops: [number, number][][] = [];
  const orbit = v.mode === 'orbit';
  for (let vz = ccz - VIEW_RADIUS; vz <= ccz + VIEW_RADIUS; vz++) {
    for (let vx = ccx - VIEW_RADIUS; vx <= ccx + VIEW_RADIUS; vx++) {
      let rx = vx; let rz = vz;
      if (torus) { rx = mod(vx, m.width); rz = mod(vz, m.height); }
      else if (rx < 0 || rz < 0 || rx >= m.width || rz >= m.height) continue;
      const ox = vx - rx; const oz = vz - rz;
      const idx = rz * m.width + rx;
      const dist = Math.hypot(vx + 0.5 - cam.ex, vz + 0.5 - cam.ez);
      const fog = v.mode === 'orbit' ? 1 : fogOf(dist);
      const fl = v.floorAt.get(idx);
      if (fl) {
        const poly = projectPoly(shift(fl.corners, ox, oz), cam, b, W, H);
        if (poly) flat.push({ poly, fill: css(fl.outdoor ? FLOOR_OUTDOOR : FLOOR_INDOOR, fog) });
      }
      if (v.ceilings && v.mode === 'walk') {
        const ce = v.ceilAt.get(idx);
        if (ce) {
          const poly = projectPoly(shift(ce.corners, ox, oz), cam, b, W, H);
          if (poly) flat.push({ poly, fill: css(CEILING, fog) });
        }
      }
      for (const q of v.byCell[idx] ?? []) {
        // Orbit aid: every wall's top edge is stroked even when its face is culled, so a wall seen from
        // its back (outside) still shows where it stands. The FACES stay culled (spec 2.3a).
        if (orbit) {
          const edge = projectPoly(shift([q.corners[3]!, q.corners[2]!, q.corners[2]!], ox, oz), cam, b, W, H);
          if (edge) tops.push([edge[0]!, edge[1]!]);
        }
        // Mandatory back-face culling, evaluated against the camera relative to this torus copy.
        if (isBackFacing(q, cam.ex - ox, cam.ez - oz)) continue;
        const poly = projectPoly(shift(q.corners, ox, oz), cam, b, W, H);
        if (!poly) continue;
        const c = wallColour(q, v.slotColours);
        const item = { d: dist, poly, fill: css(c, fog), stroke: css([0, 0, 0, 1], 1, 0.35) };
        if (c[3] < 1) over.push({ poly, fill: css(c, fog) }); else walls.push(item);
      }
    }
  }
  for (const f of flat) drawPoly(ctx, f.poly, f.fill, null);
  walls.sort((a, c) => c.d - a.d);
  for (const w of walls) drawPoly(ctx, w.poly, w.fill, w.stroke);
  for (const o of over) drawPoly(ctx, o.poly, o.fill, 'rgba(255,255,255,0.6)');
  if (tops.length) {
    ctx.strokeStyle = 'rgba(255,236,170,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const t of tops) { ctx.moveTo(t[0]![0], t[0]![1]); ctx.lineTo(t[1]![0], t[1]![1]); }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------
// Frame, minimap, status
// ---------------------------------------------------------------------------------------------

function renderNow(v: View): void {
  const cam = currentCam(v);
  if (v.renderer === 'webgl2') drawGl(v, cam); else drawCanvas2d(v, cam);
  drawMini(v);
  v.dirty = false;
}

function schedule(v: View): void {
  if (v.raf || v.seq !== mountSeq) return;
  v.raf = requestAnimationFrame(() => {
    v.raf = 0;
    if (v.seq !== mountSeq) return;
    if (v.anim && performance.now() - v.anim.t0 >= v.anim.dur) settle(v);
    if (v.dirty || v.anim) renderNow(v);
    if (v.anim) schedule(v);
  });
  v.dirty = true;
}

const MINI_PX = 6;
function drawMini(v: View): void {
  const m = v.mesh;
  if (!m || !v.showMini) return;
  const w = m.width * MINI_PX; const h = m.height * MINI_PX;
  if (v.mini.width !== w) v.mini.width = w;
  if (v.mini.height !== h) v.mini.height = h;
  const ctx = v.mini.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, w, h);
  for (const q of m.walls) {
    const x0 = q.x * MINI_PX; const y0 = q.y * MINI_PX;
    ctx.strokeStyle = q.door ? '#e0a040' : q.oneWay ? '#6aa0e0' : '#aab';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (q.side === 'north') { ctx.moveTo(x0, y0 + 0.5); ctx.lineTo(x0 + MINI_PX, y0 + 0.5); }
    else if (q.side === 'south') { ctx.moveTo(x0, y0 + MINI_PX - 0.5); ctx.lineTo(x0 + MINI_PX, y0 + MINI_PX - 0.5); }
    else if (q.side === 'west') { ctx.moveTo(x0 + 0.5, y0); ctx.lineTo(x0 + 0.5, y0 + MINI_PX); }
    else { ctx.moveTo(x0 + MINI_PX - 0.5, y0); ctx.lineTo(x0 + MINI_PX - 0.5, y0 + MINI_PX); }
    ctx.stroke();
  }
  // Pose arrow (torus wraps the arrow back into the grid).
  const ax = mod(v.mode === 'walk' ? currentCam(v).ex : v.px + 0.5, m.width) * MINI_PX;
  const az = mod(v.mode === 'walk' ? currentCam(v).ez : v.py + 0.5, m.height) * MINI_PX;
  const yaw = v.mode === 'walk' ? currentCam(v).yaw : v.pf * HALF_PI;
  ctx.save();
  ctx.translate(ax, az);
  ctx.rotate(yaw);
  ctx.fillStyle = '#e0a040';
  ctx.beginPath(); ctx.moveTo(0, -MINI_PX * 0.55); ctx.lineTo(MINI_PX * 0.35, MINI_PX * 0.4); ctx.lineTo(-MINI_PX * 0.35, MINI_PX * 0.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function slotCounts(v: View): { textured: number; flat: number } {
  const n = v.mesh ? frontFaceRequests(v.mesh).length : 0;
  return { textured: 0, flat: n };
}

function updateStatus(v: View): void {
  const m = v.mesh;
  const sc = slotCounts(v);
  const facing = ['N', 'E', 'S', 'W'][v.pf]!;
  const parts = [
    `${DUNGEON3D_TITLES.find((t) => t.id === v.gameId)?.title ?? v.gameId} ${v.entry?.label.split(' - walls')[0] ?? ''}`,
    m ? `${m.width}x${m.height} ${v.topology}` : 'no map',
    v.mode === 'walk' ? `walk (${v.px},${v.py}) ${facing}` : 'orbit',
    `${v.renderer}${v.rendererReason ? ` (${v.rendererReason})` : ''}`,
    `textured ${sc.textured}/${sc.textured + sc.flat}, ${sc.flat} flat`,
    'platform: DOS geometry, flat colour (v1)',
    v.allowLocked ? 'locked doors: pass' : 'locked doors: block',
    'keys: arrows/WASD move, C mode, F top-down, L ceiling, T colours, M map, K locked, Esc close',
  ];
  if (v.note) parts.unshift(v.note);
  const text = parts.join(' | ');
  v.statusText = text;
  const s = document.querySelector('#status');
  if (s) { s.textContent = text; s.className = 'status'; }
}

// ---------------------------------------------------------------------------------------------
// Hashing helpers (frame seam)
// ---------------------------------------------------------------------------------------------

function fnv(bytes: Uint8Array | Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function readFramePixels(v: View): Uint8Array | Uint8ClampedArray | null {
  settle(v);
  renderNow(v);
  if (v.renderer === 'webgl2' && v.gl && !v.glLost) {
    const gl = v.gl.gl;
    const px = new Uint8Array(v.canvas.width * v.canvas.height * 4);
    gl.readPixels(0, 0, v.canvas.width, v.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }
  if (v.ctx2d) return v.ctx2d.getImageData(0, 0, v.canvas.width, v.canvas.height).data;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Renderer init, resize, context loss
// ---------------------------------------------------------------------------------------------

function freshCanvas(v: View): void {
  const c = document.createElement('canvas');
  c.className = 'gb-3d-canvas';
  c.tabIndex = 0;
  c.setAttribute('aria-label', '3D dungeon view. Arrow keys move, C toggles orbit camera, Escape closes.');
  v.canvas.replaceWith(c);
  v.canvas = c;
}

function teardownGl(v: View): void {
  const g = v.gl;
  if (!g) return;
  window.clearTimeout(v.lostTimer);
  try {
    freeBufs(g);
    g.gl.deleteProgram(g.prog);
    g.gl.deleteVertexArray(g.vao);
    g.loseExt?.loseContext();
  } catch { /* context may already be gone */ }
  v.gl = null;
}

function initRenderer(v: View, reason = ''): void {
  v.ctx2d = null;
  v.glLost = false;
  if (v.rendererPref !== 'canvas2d') {
    try {
      v.gl = createGl(v.canvas);
      v.renderer = 'webgl2';
      v.rendererReason = reason || 'WebGL2 context ok';
      bindCanvasEvents(v);
      return;
    } catch (e) {
      v.gl = null;
      v.rendererReason = `WebGL2 unavailable: ${(e as Error).message}`;
      // A canvas that asked for webgl2 can never hand out a 2d context: take a fresh one.
      freshCanvas(v);
    }
  } else {
    v.rendererReason = 'canvas2d requested';
  }
  v.renderer = 'canvas2d';
  v.ctx2d = v.canvas.getContext('2d');
  bindCanvasEvents(v);
}

function fallbackToCanvas2d(v: View, why: string): void {
  teardownGl(v);
  freshCanvas(v);
  v.renderer = 'canvas2d';
  v.rendererReason = why;
  v.glLost = false;
  v.ctx2d = v.canvas.getContext('2d');
  bindCanvasEvents(v);
  resize(v);
  v.dirty = true;
  updateStatus(v);
  // Paint synchronously: a freshly swapped canvas is blank until the next animation frame otherwise.
  renderNow(v);
  schedule(v);
}

let canvasCleanup: (() => void) | null = null;

/** Pointer + context-loss listeners live on the canvas element, which can be replaced. */
function bindCanvasEvents(v: View): void {
  canvasCleanup?.();
  const c = v.canvas;
  const onLost = (e: Event) => {
    e.preventDefault();
    v.glLost = true;
    if (v.raf) { cancelAnimationFrame(v.raf); v.raf = 0; }
    v.rendererReason = 'WebGL context lost';
    updateStatus(v);
    // Not restored in time: drop to Canvas2D rather than show a dead canvas.
    v.lostTimer = window.setTimeout(() => { if (v.seq === mountSeq && v.glLost) fallbackToCanvas2d(v, 'WebGL context lost, not restored'); }, 1500);
  };
  const onRestored = () => {
    window.clearTimeout(v.lostTimer);
    try {
      teardownGl(v);
      v.gl = createGl(c);
      v.glLost = false;
      v.rendererReason = 'WebGL context restored';
      rebuildGl(v);
      v.dirty = true;
      updateStatus(v);
      schedule(v);
    } catch (e) {
      fallbackToCanvas2d(v, `WebGL restore failed: ${(e as Error).message}`);
    }
  };
  let drag: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (v.mode !== 'orbit') return;
    drag = { x: e.clientX, y: e.clientY };
    try { c.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || v.mode !== 'orbit') return;
    v.orbit.yaw += (e.clientX - drag.x) * 0.01;
    v.orbit.pitch = Math.max(-0.2, Math.min(1.5, v.orbit.pitch + (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
    v.dirty = true;
    schedule(v);
  };
  const onUp = (e: PointerEvent) => {
    drag = null;
    try { c.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };
  const onWheel = (e: WheelEvent) => {
    if (v.mode !== 'orbit') return;
    e.preventDefault();
    v.orbit.dist = Math.max(1.5, Math.min(60, v.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    v.dirty = true;
    schedule(v);
  };
  c.addEventListener('webglcontextlost', onLost);
  c.addEventListener('webglcontextrestored', onRestored);
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);
  c.addEventListener('wheel', onWheel, { passive: false });
  canvasCleanup = () => {
    c.removeEventListener('webglcontextlost', onLost);
    c.removeEventListener('webglcontextrestored', onRestored);
    c.removeEventListener('pointerdown', onDown);
    c.removeEventListener('pointermove', onMove);
    c.removeEventListener('pointerup', onUp);
    c.removeEventListener('pointercancel', onUp);
    c.removeEventListener('wheel', onWheel);
    canvasCleanup = null;
  };
}

function resize(v: View): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(200, Math.round(v.stage.clientWidth * dpr));
  const h = Math.max(150, Math.round(v.stage.clientHeight * dpr));
  if (v.canvas.width !== w) v.canvas.width = w;
  if (v.canvas.height !== h) v.canvas.height = h;
  v.size = { w, h, dpr };
  v.dirty = true;
  schedule(v);
}

// ---------------------------------------------------------------------------------------------
// Mount / close
// ---------------------------------------------------------------------------------------------

export function closeDungeon3d(): void {
  mountSeq++; // invalidates every in-flight async load and every scheduled frame
  const v = V;
  V = null;
  setDungeon3dCloser(null);
  if (v) {
    if (v.raf) cancelAnimationFrame(v.raf);
    v.raf = 0;
    for (const fn of v.cleanups.splice(0)) { try { fn(); } catch { /* best effort */ } }
    canvasCleanup?.();
    teardownGl(v);
    v.root.remove();
  }
  (window as unknown as { __dungeon3d?: unknown }).__dungeon3d = undefined;
}

function option(value: string, text: string, disabled = false): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value; o.textContent = text; o.disabled = disabled;
  return o;
}

export async function startDungeon3d(gameId: string, assetSource?: AssetSource, areaSel?: string): Promise<number> {
  closeDungeon3d();
  const seq = ++mountSeq;
  setDungeon3dCloser(() => closeDungeon3d());
  const out = document.querySelector('#output') as HTMLElement | null;
  const statusTop = document.querySelector('#status');
  if (!out) return 0;
  out.innerHTML = '';
  document.querySelectorAll('#games .cat-asset').forEach((n) => n.classList.remove('active'));
  if (statusTop) statusTop.textContent = `Loading 3D dungeon maps for ${gameId}...`;
  const qs = new URLSearchParams(window.location.search);
  const prefRaw = qs.get('renderer');
  const rendererPref: View['rendererPref'] = prefRaw === 'canvas2d' || prefRaw === 'webgl2' ? prefRaw : 'auto';

  const root = document.createElement('div');
  root.className = 'gb-3d';
  const bar = document.createElement('div');
  bar.className = 'gb-3d-bar gb-mappicker';
  const titleSel = document.createElement('select');
  titleSel.setAttribute('aria-label', 'Title');
  for (const t of DUNGEON3D_TITLES) titleSel.appendChild(option(t.id, t.title));
  titleSel.value = DUNGEON3D_TITLES.some((t) => t.id === gameId) ? gameId : 'cok';
  const areaSelEl = document.createElement('select');
  areaSelEl.setAttribute('aria-label', 'Map');
  bar.append(titleSel, areaSelEl);
  const stage = document.createElement('div');
  stage.className = 'gb-3d-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'gb-3d-canvas';
  canvas.tabIndex = 0;
  const mini = document.createElement('canvas');
  mini.className = 'gb-3d-mini';
  mini.setAttribute('aria-label', 'Minimap (click to move the camera)');
  stage.append(canvas, mini);
  root.append(bar, stage);
  out.appendChild(root);

  const v: View = {
    seq, gameId: titleSel.value, rendererPref, root, stage, canvas, mini, statusText: '', titleSel, areaSel: areaSelEl,
    renderer: 'canvas2d', rendererReason: '', ctx2d: null, gl: null, glLost: false, lostTimer: 0,
    maps: [], entry: null, mesh: null, byCell: [], floorAt: new Map(), ceilAt: new Map(),
    topology: 'bounded', mode: 'walk', allowLocked: false, ceilings: true, slotColours: true, showMini: true,
    px: 0, py: 0, pf: 0, cam: { ex: 0, ey: 0.5, ez: 0, yaw: 0, pitch: 0 }, anim: null,
    orbit: { tx: 8, tz: 8, dist: 14, yaw: 0, pitch: 0.9 }, dirty: true, raf: 0, note: '', emptyReason: '', cleanups: [],
    size: { w: 0, h: 0, dpr: 1 },
  };
  V = v;

  resize(v);
  initRenderer(v);

  const onKeyDown = (e: KeyboardEvent) => { if (V === v) onKey(v, e); };
  window.addEventListener('keydown', onKeyDown);
  v.cleanups.push(() => window.removeEventListener('keydown', onKeyDown));
  const ro = new ResizeObserver(() => { if (V === v) resize(v); });
  ro.observe(stage);
  v.cleanups.push(() => ro.disconnect());
  const onWinResize = () => { if (V === v) resize(v); };
  window.addEventListener('resize', onWinResize);
  v.cleanups.push(() => window.removeEventListener('resize', onWinResize));
  const onMiniClick = (e: MouseEvent) => {
    if (V !== v || !v.mesh) return;
    const r = v.mini.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * v.mesh.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * v.mesh.height);
    if (v.mode === 'walk') setPose(v, x, y, v.pf * 2);
    else { v.orbit.tx = x + 0.5; v.orbit.tz = y + 0.5; v.dirty = true; schedule(v); }
  };
  v.mini.addEventListener('click', onMiniClick);
  v.cleanups.push(() => v.mini.removeEventListener('click', onMiniClick));

  const populate = async (titleId: string, sel?: string): Promise<number> => {
    const maps = await loadTitleMaps(titleId, assetSource);
    if (V !== v || v.seq !== mountSeq) return 0; // closed or replaced while loading: discard
    v.gameId = titleId;
    v.maps = maps;
    v.areaSel.replaceChildren();
    for (const m of maps) v.areaSel.appendChild(option(m.key, m.label, m.overland));
    const want = (sel && maps.find((m) => m.key === sel && m.mesh)) ?? maps.find((m) => m.mesh);
    if (!want) {
      // Nothing to show: say WHY instead of leaving "Loading..." and a black canvas.
      v.entry = null; v.mesh = null; v.byCell = []; v.topology = 'bounded';
      v.emptyReason = maps.length === 0
        ? 'no-maps'
        : 'overland-only';
      v.note = maps.length === 0
        ? 'No map data found for this title (game files not served).'
        : `No dungeon maps for this title/disk (overland only): all ${maps.length} loaded maps are overland sheets (no ECL partner, mostly open edge), so no 3D view is offered.`;
      updateStatus(v);
      drawBlank(v);
      return maps.length;
    }
    v.emptyReason = '';
    selectEntry(v, want);
    return maps.length;
  };

  const onTitle = () => { void populate(v.titleSel.value); };
  const onArea = () => {
    const e = v.maps.find((m) => m.key === v.areaSel.value);
    if (e) selectEntry(v, e);
  };
  titleSel.addEventListener('change', onTitle);
  areaSelEl.addEventListener('change', onArea);
  v.cleanups.push(() => { titleSel.removeEventListener('change', onTitle); areaSelEl.removeEventListener('change', onArea); });

  installSeam(v, populate);
  const n = await populate(v.titleSel.value, areaSel ?? qs.get('area') ?? undefined);
  if (V !== v) return 0;
  (window as unknown as { __rendered: number }).__rendered = n;
  return n;
}

function drawBlank(v: View): void {
  if (v.ctx2d) { v.ctx2d.fillStyle = css(SKY); v.ctx2d.fillRect(0, 0, v.canvas.width, v.canvas.height); }
  else if (v.gl && !v.glLost) { v.gl.gl.clearColor(SKY[0], SKY[1], SKY[2], 1); v.gl.gl.clear(v.gl.gl.COLOR_BUFFER_BIT); }
}

// ---------------------------------------------------------------------------------------------
// e2e seam
// ---------------------------------------------------------------------------------------------

function installSeam(v: View, populate: (titleId: string, sel?: string) => Promise<number>): void {
  const live = <T,>(fn: () => T): T => { if (V !== v) throw new Error('dungeon3d view is closed'); return fn(); };
  const seam = {
    get gameId() { return v.gameId; },
    get areaId() { return v.entry?.key ?? null; },
    get emptyReason() { return v.emptyReason; },
    get mode() { return v.mode; },
    get renderer() { return v.renderer; },
    get rendererReason() { return v.rendererReason; },
    get topology() { return v.topology; },
    get pose() { return { x: v.px, y: v.py, facing: v.pf * 2 }; },
    get stats() { return v.mesh ? { ...v.mesh.stats } : null; },
    get texturedSlots() { return slotCounts(v).textured; },
    get flatSlots() { return slotCounts(v).flat; },
    get allowLocked() { return v.allowLocked; },
    get ceilings() { return v.ceilings; },
    get status() { return v.statusText; },
    get glLost() { return v.glLost; },
    get size() { return { ...v.size, canvasW: v.canvas.width, canvasH: v.canvas.height }; },
    maps: () => v.maps.map((m) => ({ key: m.key, label: m.label, overland: m.overland, mostlyOpen: m.mostlyOpen, eclBlockId: m.eclBlockId, topology: m.mesh?.topology ?? null, stats: m.mesh ? { ...m.mesh.stats } : null })),
    meshWallKeys: () => (v.mesh ? [...meshWallSet(v.mesh)].sort() : []),
    frameHash: () => live(() => { const px = readFramePixels(v); return px ? fnv(px) : 'no-frame'; }),
    /** Number of distinct RGB colours in the last presented frame (blank-canvas control). */
    distinctColors: () => live(() => {
      const px = readFramePixels(v);
      if (!px) return 0;
      const s = new Set<number>();
      for (let i = 0; i < px.length; i += 4) s.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
      return s.size;
    }),
    key: (k: string) => live(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      settle(v);
      return { x: v.px, y: v.py, facing: v.pf * 2 };
    }),
    step: (dir: 'forward' | 'back' | 'left' | 'right') => live(() => {
      const k = { forward: 'ArrowUp', back: 'ArrowDown', left: 'q', right: 'e' }[dir];
      const before = `${v.px},${v.py}`;
      seam.key(k);
      return `${v.px},${v.py}` !== before;
    }),
    turn: (d: 1 | -1) => live(() => { seam.key(d > 0 ? 'ArrowRight' : 'ArrowLeft'); return v.pf * 2; }),
    setMode: (m: Mode) => live(() => { setMode(v, m); }),
    setPose: (x: number, y: number, f: number) => live(() => { setPose(v, x, y, f); }),
    select: (areaId: string) => live(() => {
      const e = v.maps.find((m) => m.key === areaId);
      return e ? selectEntry(v, e) : false;
    }),
    selectTitle: (id: string) => live(() => populate(id)),
    /** Overwrite one wall slot in the loaded map and rebuild the mesh (frame-hash control). */
    patchWall: (x: number, y: number, side: Direction, slot: number) => live(() => {
      const e = v.entry;
      if (!e) return false;
      const cell = e.map.cells[y * e.map.width + x];
      if (!cell) return false;
      cell.walls[side] = slot;
      const mesh = buildDungeonMesh(e.map, { topology: v.topology, eclBlockId: e.eclBlockId ?? undefined });
      if (!mesh) return false;
      e.mesh = mesh; v.mesh = mesh;
      buildIndexes(v);
      rebuildGl(v);
      v.dirty = true;
      return true;
    }),
    /** Test hook: provoke a real webglcontextlost event (when the extension exists). */
    loseContext: () => live(() => { const e = v.gl?.loseExt; if (!e) return false; e.loseContext(); return true; }),
    /** WebGL error flag after a forced render (0 = clean); -1 when there is no live WebGL context. */
    glError: () => live(() => {
      if (!v.gl || v.glLost) return -1;
      settle(v);
      renderNow(v);
      return v.gl.gl.getError();
    }),
    opposite: (d: Direction) => OPP[d],
  };
  (window as unknown as { __dungeon3d?: unknown }).__dungeon3d = seam;
}
