import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { castSunShadow } from "./realism";
import { occupantFigure, type OccupantSpec } from "./shoppers";
import type { V3 } from "./shopperAppearance";
import { assemble, box, lamps, part, plate, profile, roadShadow, rod, slab, vehicleFinish, type Corner } from "./vehicleGeometry";

type Parts = T.BufferGeometry[];
/** Parts by finish: clear-coated paint (gloss-black trim and chrome garnish ride along), matte plastic, tinted glass, lamps. */
type Kit = Record<"paint" | "plastic" | "glass" | "lamp", Parts>;
type Finish = keyof Kit;
/** A station on the side outline: position, outward normal in (z, y), and the radius its edge rolls over onto the flat side. */
type Station = { z: number; y: number; nz: number; ny: number; r: number };
type Vertex = { pos: T.Vector3; nrm: T.Vector3 };
type Spec = ReturnType<typeof hatchback>;

const ss = T.MathUtils.smoothstep, clamp = T.MathUtils.clamp, lerp = T.MathUtils.lerp;
const sides = [-1, 1], black = "#0e0f10", trim = "#18191b", liner = "#121314", gap = "#151617", tint = "#1a2328", chrome = "#c3c7c9";

/**
 * Right-hand-drive driver's place in car space (metres; +z forward, -x the driver's right, y up from the road), for seating
 * an occupantFigure(): hip = H-point; recline = front seat backs' angle from upright, rad; wheel = rim centre and radius, its
 * column `tilt` rad above horizontal with the rim facing the driver; pedals = pad centres, clutch to accelerator from left to
 * right foot. The wheel sits close enough for bent elbows at ten to two and high enough to clear the knees.
 */
export const driverControls = {
  hatchback: { hip: [-.36, .53, -.22], recline: .16, wheel: { centre: [-.36, .92, .2], radius: .185, tilt: .42 },
    pedals: { clutch: [-.2, .27, .64], brake: [-.31, .29, .62], accelerator: [-.43, .27, .64] } },
  suv: { hip: [-.37, .66, -.2], recline: .16, wheel: { centre: [-.37, 1.05, .24], radius: .19, tilt: .38 },
    pedals: { clutch: [-.21, .36, .7], brake: [-.32, .38, .68], accelerator: [-.44, .36, .7] } },
} as const;

/** Wheel-arch opening round an axle: upright from the lower body edge behind it (aft), over the top, down to the one ahead. */
function arch(z: number, aft: number, fore: number, y: number, r: number): Corner[] {
  return [[z - r, aft, 0, .02], ...Array.from({ length: 13 }, (_, i) => [z - r * Math.cos(i * Math.PI / 12), y + r * Math.sin(i * Math.PI / 12), 0, .02] as Corner),
    [z + r, fore, 0, .02]];
}

// Box space: each car is first its side outline swept straight across ±half, the flat sides rolling onto the outline over
// each station's edge radius. bender() then gives it plan taper, a sectioned flank, tumblehome and crowned panels.
/** Compact 5-door hatchback, 3.87 x 1.73 x 1.52 m, 2.45 m wheelbase on 185/65 R15 tyres. */
function hatchback() {
  const front = 1.125, rear = -1.325, archY = .32, archR = .385;
  return {
    suv: false, half: .865, tyre: .31, tread: .185, rim: .19, track: .745, axles: [front, rear], archY, archR, length: 3.87,
    roof: 1.49, lean: .15, crease: .8, nose: [1.2, 1.93, .07], tail: [-1.45, -1.935, .045], sweep: [.075, .05], crown: [.03, .03],
    belt: (z: number) => .94 + (.8 - z) * .04,
    outline: [
      [-1.885, .3, .1, .13], [-1.76, .255, .04, .09], ...arch(rear, .255, .2, archY, archR),
      [-.85, .2, .08, .1], [.65, .2, .08, .1], ...arch(front, .2, .245, archY, archR),
      [1.62, .245, .08, .09], [1.87, .29, .1, .14], [1.935, .45, .12, .15], [1.875, .69, .06, .13], [1.76, .785, .07, .08],
      [.85, .925, .3, .07], [.8, .945, .05, .07], [0, 1.475, .16, .075], [-.3, 1.497, .55, .065], [-1.36, 1.415, .1, .07],
      [-1.43, 1.39, .05, .09], [-1.775, 1, .1, .11], [-1.86, .73, .1, .13], [-1.925, .63, .1, .13], [-1.935, .42, .14, .13],
    ] as Corner[],
    // Windscreen and tailgate glass as z ranges of the outline. Side glass: [rear edge at the belt, rear edge at the
    // top, front edge] for each pane (a front edge past the A-pillar closes along it), then the seal round them all.
    screen: [.14, .77], backlight: [-1.745, -1.46],
    panes: [[-.4, -.4, 3], [-1.15, -1.15, -.48], [-1.5, -1.32, -1.18]], seal: [-1.515, -1.335, 3],
    lamps: { head: [.635, .768], tail: [.78, .97], grille: [.41, .6], intake: [.33, .395], plate: [.465, .86], diffuser: [.335, .4], reflector: .44 },
    doors: [.68, -.44, -.95], handles: [-.25, -1.02],
  };
}

/** Compact SUV, 4.3 x 1.79 x 1.64 m, 2.6 m wheelbase on 215/60 R16 tyres: cladding, skid plates, roof rails. */
function crossover(): Spec {
  const front = 1.25, rear = -1.35, archY = .35, archR = .42;
  return {
    suv: true, half: .895, tyre: .332, tread: .215, rim: .203, track: .77, axles: [front, rear], archY, archR, length: 4.3,
    roof: 1.6, lean: .13, crease: .9, nose: [1.35, 2.15, .055], tail: [-1.6, -2.15, .04], sweep: [.07, .045], crown: [.025, .025],
    belt: (z: number) => 1.06 + (.93 - z) * .025,
    outline: [
      [-2.09, .36, .12, .13], [-1.9, .3, .06, .09], ...arch(rear, .3, .235, archY, archR),
      [-.88, .235, .08, .1], [.78, .235, .08, .1], ...arch(front, .235, .3, archY, archR),
      [1.75, .3, .08, .09], [2.08, .34, .12, .15], [2.15, .55, .12, .16], [2.14, .84, .06, .15], [2.04, .955, .07, .09],
      [.98, 1.05, .3, .075], [.93, 1.065, .05, .07], [.08, 1.58, .16, .075], [-.6, 1.6, .55, .07], [-1.74, 1.585, .08, .075],
      [-1.79, 1.562, .05, .09], [-1.95, 1.16, .08, .11], [-2.07, .83, .1, .13], [-2.145, .74, .1, .13], [-2.15, .47, .14, .13],
    ] as Corner[],
    screen: [.23, .9], backlight: [-1.93, -1.81],
    panes: [[-.44, -.44, 3], [-1.25, -1.25, -.52], [-1.72, -1.6, -1.29]], seal: [-1.735, -1.615, 3],
    lamps: { head: [.8, .93], tail: [.92, 1.1], grille: [.5, .78], intake: [.43, .49], plate: [.585, .99], diffuser: [.42, .49], reflector: .55 },
    doors: [.8, -.48, -1.02], handles: [-.28, -1.1],
  };
}

/** The outline resampled to `step`, clockwise in (z, y) so (nz, ny) points out, its edge radii eased along it. */
function stations(corners: Corner[], step: number, fillet = 6): Station[] {
  let pts = profile(corners, fillet);
  const area = pts.reduce((sum, [z, y], i) => sum + z * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0);
  if (area > 0) pts = pts.reverse();
  const dense: number[][] = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step);
    for (let k = 0; k < n; k++) dense.push(p.map((v, j) => v + (q[j] - v) * k / n));
  });
  const n = dense.length, at = (i: number) => dense[(i + n) % n];
  // A convex bend tighter than the edge radius would fold the rolled edge over itself: ease the edge there, and blend
  // the eased radius into its neighbours so the flank's outline keeps no spikes.
  const limit = dense.map((p, i) => {
    const [z0, y0] = at(i - 1), [z1, y1] = at(i + 1), ax = p[0] - z0, ay = p[1] - y0, bx = z1 - p[0], by = y1 - p[1];
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    return turn < 0 ? Math.max(.004, .8 * Math.hypot(z1 - z0, y1 - y0) / 2 / -turn) : Infinity;
  });
  for (let pass = 0; pass < 10; pass++) {
    const r = dense.map((p, i) => Math.min(p[2], limit[i]));
    dense.forEach((p, i) => { p[2] = (r[(i + n - 1) % n] + 2 * r[i] + r[(i + 1) % n]) / 4; });
  }
  return dense.map((p, i) => {
    const [z0, y0] = at(i - 1), [z1, y1] = at(i + 1), dz = z1 - z0, dy = y1 - y0, l = Math.hypot(dz, dy);
    return { z: p[0], y: p[1], nz: -dy / l, ny: dz / l, r: Math.min(p[2], limit[i]) };
  });
}

/** Point on the box-space skin: w is the signed distance across it from the centre line (flat top, rolled edge,
 * then inward over the flat side), lifted off it along the normal. */
function skin(p: Station, w: number, lift: number, half: number): Vertex {
  const side = Math.sign(w) || 1, d = Math.abs(w), flat = half - p.r, a = clamp((d - flat) / p.r, 0, Math.PI / 2);
  const inset = d <= flat ? 0 : p.r * (1 - Math.cos(a)) + Math.max(0, d - flat - p.r * Math.PI / 2);
  const nrm = new T.Vector3(side * Math.sin(a), p.ny * Math.cos(a), p.nz * Math.cos(a));
  return { pos: new T.Vector3(side * (d <= flat ? d : flat + p.r * Math.sin(a)), p.y - p.ny * inset, p.z - p.nz * inset).addScaledVector(nrm, lift), nrm };
}

/** Collects loose faces by finish, each in its own colour. */
function sink() {
  const sets: Partial<Record<Finish, number[][]>> = {}, color = new T.Color();
  const put = (finish: Finish, hex: string, v: Vertex[], order: number[]) => {
    const [p, n, c] = sets[finish] ??= [[], [], []];
    color.set(hex);
    for (const i of order) { p.push(...v[i].pos.toArray()); n.push(...v[i].nrm.toArray()); c.push(color.r, color.g, color.b); }
  };
  return {
    quad: (finish: Finish, hex: string, ...v: Vertex[]) => put(finish, hex, v, [0, 1, 2, 0, 2, 3]),
    tri: (finish: Finish, hex: string, ...v: Vertex[]) => put(finish, hex, v, [0, 1, 2]),
    into(kit: Kit) {
      for (const [finish, [p, n, c]] of Object.entries(sets) as [Finish, number[][]][]) {
        const g = new T.BufferGeometry();
        g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
        g.setAttribute("normal", new T.Float32BufferAttribute(n, 3));
        g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
        kit[finish].push(g);
      }
    },
  };
}
type Sink = ReturnType<typeof sink>;
const kitOf = (): Kit => ({ paint: [], plastic: [], glass: [], lamp: [] });

/** Station part-way along the outline, s in [0, 1) of its stations. */
function along(st: Station[], s: number): Station {
  const n = st.length, f = (s - Math.floor(s)) * n, i = Math.floor(f), t = f - i, a = st[i % n], b = st[(i + 1) % n];
  const nz = lerp(a.nz, b.nz, t), ny = lerp(a.ny, b.ny, t), l = Math.hypot(nz, ny);
  return { z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), nz: nz / l, ny: ny / l, r: lerp(a.r, b.r, t) };
}
/** Fraction along the outline where it passes `value` on axis 0 (z) or 1 (y), on stations facing (nz, ny) between z0 and z1. */
function locate(st: Station[], axis: 0 | 1, value: number, nz: number, ny: number, z0 = -Infinity, z1 = Infinity) {
  const n = st.length, key = (p: Station) => axis ? p.y : p.z, facing = (p: Station) => p.nz * nz + p.ny * ny > .25 && p.z >= z0 && p.z <= z1;
  for (let i = 0; i < n; i++) {
    const a = st[i], b = st[(i + 1) % n];
    if (facing(a) && facing(b) && (key(a) - value) * (key(b) - value) <= 0 && key(a) !== key(b)) return (i + (value - key(a)) / (key(b) - key(a))) / n;
  }
  throw new Error(`no station at ${value}`);
}

/** Height of the flank's upper edge (the outline inset by its edge radius) at z, over upward-facing stations. */
function upper(st: Station[], z: number) {
  let y = -Infinity;
  st.forEach((a, i) => {
    const b = st[(i + 1) % st.length], za = a.z - a.nz * a.r, zb = b.z - b.nz * b.r;
    if (a.ny < .2 || b.ny < .2 || (z - za) * (z - zb) > 0 || za === zb) return;
    const ya = a.y - a.ny * a.r, yb = b.y - b.ny * b.r;
    y = Math.max(y, ya + (yb - ya) * (z - za) / (zb - za));
  });
  return y;
}
/** Window outline on the flank, `top` below its upper edge and `bottom` above the belt: the rear edge runs from zb at
 * the belt to zt at the top, the front edge stands at zf unless the band runs out first along the A-pillar. */
function pane(st: Station[], belt: (z: number) => number, [zb, zt, zf]: number[], top: number, bottom: number): Corner[] {
  const lo = (z: number) => belt(z) + bottom, hi = (z: number) => upper(st, z) - top, out: Corner[] = [];
  for (let i = 0; i <= 40; i++) {
    const z = zt + (Math.min(zf, 2.5) - zt) * i / 40, open = hi(z) - lo(z);
    if (open < .004) { // the band runs out here: end on the belt where it closes
      const [pz, py] = out[out.length - 1], t = (py - lo(pz)) / (py - lo(pz) - open), cz = lerp(pz, z, t);
      out.push([cz, lo(cz), 0]);
      break;
    }
    out.push([z, hi(z), i ? 0 : .03]);
  }
  if (out[out.length - 1][0] >= zf - 1e-6) out.push([zf, lo(zf), .015]);
  out.push([zb, lo(zb), .015]);
  return out;
}

/** A patch lifted off the skin over outline fractions s0..s1 and across w0..w1 (either may be [at s0, at s1]). */
function patch(out: Sink, finish: Finish, color: string, st: Station[], half: number,
  s0: number, s1: number, w0: number | number[], w1: number | number[], lift: number, rows = 4, cols = 6) {
  const lo = typeof w0 === "number" ? [w0, w0] : w0, hi = typeof w1 === "number" ? [w1, w1] : w1;
  s1 -= Math.round(s1 - s0); // the short way round the closed outline
  const grid = Array.from({ length: rows + 1 }, (_, i) => {
    const t = i / rows, p = along(st, lerp(s0, s1, t));
    return Array.from({ length: cols + 1 }, (_, k) => skin(p, lerp(lerp(lo[0], lo[1], t), lerp(hi[0], hi[1], t), k / cols), lift, half));
  });
  for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) out.quad(finish, color, grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]);
}

/** The swept skin quad by quad: underbody and arch liners in plastic (and the SUV's cladding), windscreen and tailgate
 * glass between the pillars when glazed. `roll` steps round each rolled edge, `mid` across the top. */
function coachwork(out: Sink, s: Spec, st: Station[], paint: string, roll: number, mid: number, glazed: boolean) {
  const H = s.half, nearArch = (z: number, y: number) => s.axles.some(a => Math.hypot(z - a, y - s.archY) < s.archR + .012 && y > .2);
  const ring = st.map(p => {
    const flat = H - p.r;
    return Array.from({ length: 2 * roll + mid + 1 }, (_, k) => skin(p, k <= roll ? -(flat + p.r * (roll - k) / roll * Math.PI / 2)
      : k >= roll + mid ? flat + p.r * (k - roll - mid) / roll * Math.PI / 2 : -flat + 2 * flat * (k - roll) / mid, 0, H));
  });
  st.forEach((a, i) => {
    const j = (i + 1) % st.length, b = st[j], z = (a.z + b.z) / 2, y = (a.y + b.y) / 2, ny = (a.ny + b.ny) / 2, nz = (a.nz + b.nz) / 2;
    for (let k = 0; k < 2 * roll + mid; k++) {
      const middle = k >= roll && k < roll + mid;
      let finish: Finish = "paint", color = paint;
      if (glazed && ((ny < -.6 && y < .4) || nearArch(z, y))) [finish, color] = middle ? ["plastic", liner] : s.suv ? ["plastic", trim] : ["paint", paint];
      else if (glazed && s.suv && y < .42 && Math.abs(z) > s.axles[0] + .2) [finish, color] = ["plastic", trim];
      else if (glazed && middle && ny > .3 && z > s.screen[0] && z < s.screen[1]) [finish, color] = ["glass", tint];
      else if (glazed && middle && nz < -.3 && z > s.backlight[0] && z < s.backlight[1]) [finish, color] = ["glass", tint];
      out.quad(finish, color, ring[i][k], ring[j][k], ring[j][k + 1], ring[i][k + 1]);
    }
  });
}

/** Faces of a flat (z, y) shape stood on the flank at x = ±at. */
function onFlank(out: Sink, finish: Finish, color: string, shape: T.Shape, at: number) {
  const g = new T.ShapeGeometry(shape, 1).toNonIndexed(), p = g.getAttribute("position");
  for (const side of sides) for (let i = 0; i < p.count; i += 3) {
    const v = (k: number): Vertex => ({ pos: new T.Vector3(side * at, p.getY(i + k), p.getX(i + k)), nrm: new T.Vector3(side, 0, 0) });
    out.tri(finish, color, v(0), v(1), v(2));
  }
  g.dispose();
}

/** The flanks at x = ±half. Below the belt they are cut into upright strips between outline stations, each sliced at
 * `levels` so bend() can section the side (strips share their edge vertices, so the panel stays sealed); above it a
 * plain panel frames the window opening. */
function flanks(out: Sink, color: string, st: Station[], s: Spec, levels: number[], opening?: Corner[]) {
  const ring = st.map(p => new T.Vector2(p.z - p.nz * p.r, p.y - p.ny * p.r));
  let lo = 0, hi = 0;
  ring.forEach((p, i) => { if (p.x < ring[lo].x) lo = i; if (p.x > ring[hi].x) hi = i; });
  const chain = (from: number, to: number) => { const c: T.Vector2[] = []; for (let i = from; ; i = (i + 1) % ring.length) { c.push(ring[i]); if (i === to) return c; } };
  const rise = (p: T.Vector2) => p.y - s.belt(p.x), top: T.Vector2[] = [], over: T.Vector2[] = [], line: T.Vector2[] = [];
  chain(lo, hi).forEach((p, i, u) => {
    const q = u[i - 1];
    if (q && rise(p) > 0 !== rise(q) > 0) {
      const c = q.clone().lerp(p, rise(q) / (rise(q) - rise(p)));
      if (rise(p) <= 0) { // back below the belt at the front: lay the belt line from the rear crossing to here
        const from = over[0], n = Math.ceil((c.x - from.x) / .1);
        for (let k = 1; k < n; k++) { const z = lerp(from.x, c.x, k / n); line.push(new T.Vector2(z, s.belt(z))); }
        top.push(...line);
      }
      top.push(c); over.push(c);
    }
    (rise(p) > 0 ? over : top).push(p);
  });
  // Height of a z-sorted chain at z, read on the side of z the strip lies (dir +1 to its right, -1 to its left).
  const height = (c: T.Vector2[], z: number, dir: number) => {
    for (let i = 0; i + 1 < c.length; i++) {
      const a = c[i], b = c[i + 1];
      if (dir > 0 ? a.x <= z && z < b.x : a.x < z && z <= b.x) return lerp(a.y, b.y, (z - a.x) / (b.x - a.x));
    }
    return c[dir > 0 ? 0 : c.length - 1].y;
  };
  const clip = (poly: T.Vector2[], y0: number, sign: number) => {
    const kept: T.Vector2[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length], da = sign * (a.y - y0), db = sign * (b.y - y0);
      if (da >= 0) kept.push(a);
      if (da * db < 0) kept.push(a.clone().lerp(b, da / (da - db)));
    });
    return kept;
  };
  const bottom = chain(hi, lo).reverse(), zs = [...new Set([...bottom, ...top].map(p => p.x))].sort((a, b) => a - b);
  for (const side of sides) {
    const v = (p: T.Vector2): Vertex => ({ pos: new T.Vector3(side * s.half, p.y, p.x), nrm: new T.Vector3(side, 0, 0) });
    for (let c = 0; c + 1 < zs.length; c++) {
      const za = zs[c], zb = zs[c + 1];
      if (zb - za < 1e-6) continue;
      const quad = [new T.Vector2(za, height(bottom, za, 1)), new T.Vector2(zb, height(bottom, zb, -1)),
        new T.Vector2(zb, height(top, zb, -1)), new T.Vector2(za, height(top, za, 1))];
      for (let k = 0; k <= levels.length; k++) {
        let band = quad;
        if (k) band = clip(band, levels[k - 1], 1);
        if (k < levels.length) band = clip(band, levels[k], -1);
        for (let i = 2; i < band.length; i++) out.tri("paint", color, v(band[0]), v(band[i - 1]), v(band[i]));
      }
    }
  }
  const panel = new T.Shape([...over, ...[...line].reverse()]);
  if (opening) panel.holes = [new T.Path(profile(opening).map(([z, y]) => new T.Vector2(z, y)))];
  onFlank(out, "paint", color, panel, s.half);
}

/** Box space to car space: plan taper at nose and tail, the flank's section (fullest at the crease, tucked under at
 * the sill, easing in to the belt), tumblehome above it, crowned hood and roof, and a nose and tail that bow out. */
function bender(s: Spec) {
  const [nose0, nose1, noseIn] = s.nose, [tail0, tail1, tailIn] = s.tail, [hoodCrown, roofCrown] = s.crown, c = s.crease;
  return (v: T.Vector3) => {
    const { x, y, z } = v, q = Math.max(0, 1 - (x / s.half) ** 2), belt = s.belt(z), u = (c - y) / (c - .2);
    const plan = 1 - noseIn * ss(z, nose0, nose1) ** 1.5 - tailIn * ss(-z, -tail0, -tail1) ** 1.5;
    const section = y < c ? 1 - .012 * u - .03 * u * u : 1 - .022 * Math.min(1, (y - c) / (belt - c));
    const lean = 1 - s.lean * clamp((y - belt) / (s.roof - belt), 0, 1);
    v.set(x * plan * section * lean, y + q * (hoodCrown * ss(y, .6, .9) + roofCrown * ss(y, belt + .1, s.roof - .05)),
      z + q * (s.sweep[0] * ss(z, nose0 + .2, nose1) - s.sweep[1] * ss(-z, -tail0 - .15, -tail1)));
  };
}

/** Moves every vertex through `f`, carrying normals across by its local Jacobian (sampled just inside each face, so a
 * crease gives each side its own normal), and winds each face to match. */
function bend(g: T.BufferGeometry, f: (v: T.Vector3) => void) {
  const p = g.getAttribute("position") as T.BufferAttribute, n = g.getAttribute("normal"), c = g.getAttribute("color"), h = .002;
  const moved = new Float32Array(p.count * 3);
  const v = new T.Vector3(), at = new T.Vector3(), nv = new T.Vector3(), t1 = new T.Vector3(), t2 = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
  const slope = (out: T.Vector3, dir: T.Vector3) => {
    f(out.copy(at).addScaledVector(dir, h)); f(a.copy(at).addScaledVector(dir, -h));
    return out.sub(a);
  };
  for (let i = 0; i < p.count; i++) {
    const face = i - i % 3;
    v.fromBufferAttribute(p, i);
    at.fromBufferAttribute(p, face).add(a.fromBufferAttribute(p, face + 1)).add(b.fromBufferAttribute(p, face + 2)).divideScalar(3).sub(v);
    at.multiplyScalar(Math.min(1, .006 / (at.length() || 1))).add(v);
    nv.fromBufferAttribute(n, i).normalize();
    t1.set(Math.abs(nv.y) < .9 ? 0 : 1, Math.abs(nv.y) < .9 ? 1 : 0, 0).cross(nv).normalize(); t2.crossVectors(nv, t1);
    slope(b, t1); slope(t1, t2);
    nv.crossVectors(b, t1).normalize();
    n.setXYZ(i, nv.x, nv.y, nv.z);
    f(v); moved.set([v.x, v.y, v.z], i * 3);
  }
  p.copyArray(moved);
  for (let i = 0; i < p.count; i += 3) {
    v.fromBufferAttribute(p, i); a.fromBufferAttribute(p, i + 1).sub(v); b.fromBufferAttribute(p, i + 2).sub(v);
    nv.fromBufferAttribute(n, i).add(t1.fromBufferAttribute(n, i + 1)).add(t2.fromBufferAttribute(n, i + 2));
    if (a.cross(b).dot(nv) >= 0) continue;
    for (const attr of [p, n, c]) for (let k = 0; k < 3; k++) {
      const swap = attr.getComponent(i + 1, k); attr.setComponent(i + 1, k, attr.getComponent(i + 2, k)); attr.setComponent(i + 2, k, swap);
    }
  }
  return g;
}

function rbox(bucket: Parts, color: string, x: number, y: number, z: number, w: number, h: number, d: number, r: number, rx = 0, ry = 0, rz = 0) {
  part(bucket, new RoundedBoxGeometry(w, h, d, 1, r), color, x, y, z, 1, 1, 1, rx, ry, rz);
}

/** Lamps, grille, bumpers, plates, mirrors, handles, shut lines, wipers, antenna, exhaust, cladding and cabin. */
function details(kit: Kit, out: Sink, s: Spec, st: Station[], paint: string, seal: Corner[]) {
  // Nose and tail faces only: the arches' upright edges face fore and aft too.
  const H = s.half, L = s.lamps, fore = (y: number) => locate(st, 1, y, 1, 0, s.axles[0] + s.archR + .02),
    aft = (y: number) => locate(st, 1, y, -1, 0, -Infinity, s.axles[1] - s.archR - .02);
  const on = (finish: Finish, color: string, a: number, b: number, w0: number | number[], w1: number | number[], lift: number, rows = 4, cols = 6) =>
    patch(out, finish, color, st, H, a, b, w0, w1, lift, rows, cols);
  const wrap = (y: number, face: (y: number) => number) => { const p = along(st, face(y)); return H - p.r + p.r * Math.PI / 2; };
  const point = (s0: number, w: number, lift: number) => skin(along(st, s0), w, lift, H).pos;
  const [h0, h1] = L.head, [t0, t1] = L.tail, [g0, g1] = L.grille, [i0, i1] = L.intake;
  const tip = Math.max(...seal.map(([z]) => z)), mirror = tip - .045;
  for (const k of sides) {
    // Headlamp: black bezel sweeping round the corner onto the wing, a silvered reflector, a projector lens in a chrome
    // ring, an LED strip along its upper edge and an amber indicator at the outer end.
    const end = wrap(h1, fore) + .09;
    on("lamp", "#141618", fore(h0), fore(h1), [k * .46, k * .42], [k * end * .86, k * end], .003, 5, 18);
    on("lamp", "#8a9296", fore(h0 + .01), fore(h1 - .012), [k * .475, k * .435], [k * (end * .86 - .02), k * (end - .025)], .006, 5, 18);
    const lens = point(fore((h0 + h1) / 2 - .004), k * .54, .008);
    part(kit.lamp, new T.SphereGeometry(.5, 12, 4), "#c3c9cb", lens.x, lens.y, lens.z, .07, .062, .014);
    part(kit.lamp, new T.SphereGeometry(.5, 10, 4), "#59636a", lens.x, lens.y, lens.z + .004, .042, .037, .02);
    on("lamp", "#f4f6f6", fore(h1 - .026), fore(h1 - .014), k * .47, k * (end - .03), .009, 2, 20);
    on("lamp", "#e8952c", fore(h0 + .016), fore(h0 + .05), k * (end * .86 - .11), k * (end * .86 - .03), .009, 3, 6);
    // Tail lamp: dark surround, red lens, brighter tail bar, amber indicator and the white reversing lamp inboard.
    const back = wrap(t0, aft) + .13;
    on("lamp", "#2a0d0f", aft(t1), aft(t0), [k * .5, k * .46], k * back, .003, 3, 18);
    on("lamp", "#9c1518", aft(t1 - .015), aft(t0 + .015), [k * .52, k * .48], k * (back - .015), .006, 3, 18);
    on("lamp", "#d8262a", aft(t1 - .04), aft(t1 - .07), k * .56, k * (back - .03), .009, 1, 18);
    on("lamp", "#de8a2a", aft(t0 + .05), aft(t0 + .085), k * .72, k * (back - .05), .009, 1, 10);
    on("lamp", "#e6e6e2", aft(t0 + .03), aft(t0 + .09), k * .5, k * .6, .009, 1, 2);
    // Fog lamps in black bezels at the ends of the lower intake, red reflectors low on the rear bumper.
    on("plastic", trim, fore(i1 - .005), fore(i1 + .07), k * .5, k * .68, .003, 4, 4);
    const fog = point(fore(i1 + .032), k * .59, .004); part(kit.lamp, new T.SphereGeometry(.5, 10, 4), "#b9bfc1", fog.x, fog.y, fog.z, .06, .045, .01);
    on("lamp", "#8e1212", aft(L.reflector), aft(L.reflector + .04), k * .58, k * .74, .004, 1, 3);
    // Wing mirror on a black sail at the front corner of the side glass: body-coloured cap, glass, repeater.
    const my = s.belt(mirror) + .085, mx = k * (H + .035);
    box(kit.plastic, trim, k * (H - .005), my - .045, mirror + .01, .03, .05, .09);
    rbox(kit.paint, paint, mx, my, mirror, .17, .105, .125, .04);
    box(kit.paint, "#8fa3ad", mx + k * .01, my, mirror - .064, .13, .075, .004);
    box(kit.lamp, "#e8952c", k * (H + .115), my - .012, mirror + .03, .012, .012, .06);
    // Door handles in recessed pockets; shut lines round the doors.
    for (const z of s.handles) {
      box(kit.paint, gap, k * (H + .0012), s.belt(z) - .085, z, .002, .045, .14);
      rbox(kit.paint, paint, k * (H + .01), s.belt(z) - .085, z, .02, .026, .125, .009);
    }
    const [dz0, dz1, dz2] = s.doors, sill = s.suv ? .38 : .29, line = (za: number, ya: number, zb: number, yb: number) =>
      box(kit.paint, gap, k * (H + .0008), (ya + yb) / 2, (za + zb) / 2, .0015, Math.hypot(yb - ya, zb - za), .0045, Math.atan2(zb - za, yb - ya));
    line(dz0, sill, tip - .01, s.belt(tip));
    line(dz1, sill, dz1, s.belt(dz1));
    line(dz2, sill, dz2, s.archY + s.archR * .9);
    line(dz2, s.archY + s.archR * .9, dz2 - .24, s.belt(dz2 - .24) + .005);
  }
  // Grille: black mesh of staggered cells under a chrome top bar; black lower lip across the bumper.
  const gw = s.suv ? .56 : .42;
  on("paint", black, fore(g0), fore(g1), [-gw, -gw * .8], [gw, gw * .8], .003, 6, 10);
  for (let y = g0 + .02, row = 0; y < g1 - .015; y += .028, row++)
    for (let x = -gw * .8 + (row % 2) * .025; x < gw * .8 - .03; x += .05) on("plastic", "#34373a", fore(y), fore(y + .012), x, x + .03, .006, 1, 1);
  on("paint", chrome, fore(g1 - .008), fore(g1 + .002), -gw * .82, gw * .82, .007, 2, 10);
  on("plastic", trim, fore(i0), fore(i1), -.62, .62, .003, 4, 10);
  // Number plates: white private plates, front on the bumper, rear on the tailgate under a chrome garnish.
  const [pf, pr] = L.plate, nose = along(st, fore(pf)), tail = along(st, aft(pr));
  plate(kit.plastic, pf, nose.z + .022, [[2, 2, 2, 4]], 1, "#f3f3ef", .5, 1.15);
  on("plastic", trim, aft(pr - .085), aft(pr + .085), -.3, .3, .002, 2, 6);
  plate(kit.plastic, pr, tail.z - .02, [[2, 2, 2, 4]], -1, "#f3f3ef", .5, 1.15);
  on("paint", chrome, aft(pr + .1), aft(pr + .118), -.33, .33, .005, 1, 6);
  on("plastic", trim, aft(L.diffuser[0]), aft(L.diffuser[1]), -.6, .6, .004, 5, 10);
  // Bonnet and tailgate shut lines, cowl panel and wipers, high-mount stop lamp, rear wiper.
  on("paint", gap, fore(h1 + .008), fore(h1 + .013), -(H - .1), H - .1, .0012, 1, 8);
  on("paint", gap, aft(t0 - .045), aft(t0 - .04), -(H - .14), H - .14, .0012, 1, 8);
  const cowl = locate(st, 0, s.screen[1] + .03, 0, 1), screen = along(st, locate(st, 0, s.screen[1] - .03, 0, 1));
  on("plastic", trim, cowl - .0008, cowl + .0016, -(H - .12), H - .12, .002, 2, 8);
  for (const x of [-.62, -.04]) {
    const a = skin(screen, x, .02, H).pos, b = skin(screen, x + .58, .02, H).pos;
    rod(kit.plastic, black, [a.x, a.y, a.z], [b.x, b.y + .03, b.z - .03], .007);
  }
  on("lamp", "#b51c1c", locate(st, 0, s.backlight[1] - .004, -.5, .5), locate(st, 0, s.backlight[1] - .02, -.5, .5), -.13, .13, .006, 1, 2);
  const gl = skin(along(st, locate(st, 0, s.backlight[0] + .02, -.5, .5)), 0, .015, H).pos;
  rod(kit.plastic, black, [gl.x, gl.y, gl.z], [gl.x + .3, gl.y + .12, gl.z + .04], .007);
  // Shark-fin antenna at the back of the roof; exhaust tail pipe under the left of the rear bumper.
  const fin = along(st, locate(st, 0, s.backlight[1] + .32, 0, 1));
  slab(kit.paint, paint, [[fin.z + .1, fin.y - .01, .02], [fin.z - .07, fin.y + .065, .03], [fin.z - .1, fin.y - .01, .01]], -.028, .028);
  const pipe = along(st, aft(L.diffuser[0]));
  rod(kit.plastic, "#2b2b2b", [.42, pipe.y - .05, pipe.z + .25], [.42, pipe.y - .05, pipe.z - .03], .028);
  part(kit.paint, new T.TorusGeometry(.028, .005, 6, 14), chrome, .42, pipe.y - .05, pipe.z - .03);
  // Wheelhouse walls inboard of each tyre close the arch tunnels; fixed brake calipers peep through the front spokes.
  for (const z of s.axles) for (const k of sides) {
    const x = k * (s.track - s.tread / 2 - .035);
    slab(kit.plastic, liner, arch(z, .26, .26, s.archY, s.archR + .01), x, x + k * .01);
    if (z === s.axles[0]) box(kit.plastic, "#36383b", k * (s.track - .045), s.tyre + .07, z - .09, .045, .1, .06, .9);
  }
  if (s.suv) {
    // Black arch flares and sill cladding, silver skid plates, roof rails on feet.
    for (const z of s.axles) for (const k of sides) {
      const aftY = z < 0 ? .3 : .235, foreY = z < 0 ? .235 : .3;
      slab(kit.plastic, trim, [...arch(z, aftY, foreY, s.archY, s.archR + .06), ...arch(z, aftY, foreY, s.archY, s.archR).reverse()], k * (H - .004), k * (H + .014));
    }
    for (const k of sides) slab(kit.plastic, trim, [[-.9, .24, .03], [.8, .24, .03], [.8, .37, .02], [-.9, .37, .02]], k * (H - .004), k * (H + .012));
    on("paint", "#aeb2b4", fore(i0 - .055), fore(i0 - .01), -.42, .42, .007, 4, 8);
    on("paint", "#aeb2b4", aft(L.diffuser[0] + .015), aft(L.diffuser[1] - .015), -.45, .45, .007, 4, 8);
    for (const k of sides) {
      const roof = [.05, -.35, -.75, -1.15, -1.55].map(z => along(st, locate(st, 0, z, 0, 1))), x = k * (H - .16);
      part(kit.plastic, new T.TubeGeometry(new T.CatmullRomCurve3(roof.map(p => new T.Vector3(x, p.y + .042, p.z))), 16, .015, 6), "#2a2b2d");
      for (const p of [roof[0], roof[2], roof[4]]) box(kit.plastic, "#2a2b2d", x, p.y + .022, p.z, .026, .045, .09);
    }
  }
  cabin(kit.plastic, s);
}

/** Rear edge of the dash top, z. The dash box runs .32 m back from it and .2 m down from the belt. */
const dashAt = (s: Spec) => s.screen[1] - .06;

/** Dim cabin behind the tint: door trims, floor, dashboard and binnacle, steering wheel, seats, parcel shelf. */
function cabin(bucket: Parts, s: Spec) {
  const d = s.suv ? driverControls.suv : driverControls.hatchback, H = s.half, lift = d.hip[1] - .53, fabric = "#2f3032";
  // Trims and floor stop short of the wheel arches, where they would show through.
  const sill = .33 + lift, sash = s.belt(0) - .03, dash = dashAt(s), z0 = s.axles[1] + s.archR + .03, z1 = s.axles[0] - s.archR - .03;
  for (const k of sides) box(bucket, "#2b2c2e", k * (H - .045), (sill + sash) / 2, (z0 + z1) / 2, .03, sash - sill, z1 - z0);
  box(bucket, "#262729", 0, sill - .03, (z0 + z1) / 2, 2 * H - .1, .02, z1 - z0);
  box(bucket, "#222325", 0, s.belt(dash) - .1, dash - .16, 2 * H - .12, .2, .32);
  // Instrument hood on the dash top; steering wheel (rim, hub and three spokes) on a column running into the dash.
  const [wx, wy, wz] = d.wheel.centre, { radius: wr, tilt } = d.wheel, column = (dash - .28 - wz) / Math.cos(tilt);
  box(bucket, "#1c1d1f", wx, s.belt(dash) + .035, dash - .29, .34, .07, .16);
  part(bucket, new T.TorusGeometry(wr, .016, 5, 18), "#1a1b1c", wx, wy, wz, 1, 1, 1, tilt, 0, 0);
  part(bucket, new T.CylinderGeometry(.06, .07, .05, 12), "#202123", wx, wy - .02 * Math.sin(tilt), wz + .02 * Math.cos(tilt), 1, 1, 1, tilt + Math.PI / 2, 0, 0);
  for (const a of [0, Math.PI, -Math.PI / 2]) rod(bucket, "#1a1b1c", [wx, wy, wz],
    [wx + wr * Math.cos(a), wy + wr * Math.sin(a) * Math.cos(tilt), wz + wr * Math.sin(a) * Math.sin(tilt)], .012);
  rod(bucket, "#1a1b1c", [wx, wy, wz], [wx, wy - column * Math.sin(tilt), wz + column * Math.cos(tilt)], .025);
  // Front seats: cushion under the hip, back and headrest leaning at `recline`, their faces where an occupant's back rests.
  const [, hy, hz] = d.hip, up = [Math.cos(d.recline), -Math.sin(d.recline)], fwd = [Math.sin(d.recline), Math.cos(d.recline)];
  const lean = (u: number, n: number) => [hy + u * up[0] + n * fwd[0], hz - .14 + u * up[1] + n * fwd[1]];
  for (const x of [d.hip[0], -d.hip[0]]) {
    box(bucket, fabric, x, hy - .1, hz + .03, .48, .1, .5);
    const [by, bz] = lean(.22, -.05), [ry, rz] = lean(.64, -.03);
    box(bucket, fabric, x, by, bz, .48, .6, .1, -d.recline);
    box(bucket, fabric, x, ry, rz, .25, .16, .09, -d.recline);
  }
  const rz = d.hip[2] - .82;
  box(bucket, fabric, 0, d.hip[1] - .08, rz + .05, 2 * H - .3, .1, .46);
  box(bucket, fabric, 0, d.hip[1] + .22, rz - .22, 2 * H - .3, .56, .1, -.22);
  for (const x of [-.36, .36]) box(bucket, fabric, x, d.hip[1] + .58, rz - .3, .24, .14, .08, -.2);
  box(bucket, "#24252a", 0, s.belt(rz - .4) - .03, rz - .42, 2 * H - .24, .02, .36);
}

/**
 * The driver on the right (right-hand drive), back on the seat, hands at ten to two and feet at the pedals; in the SUV a
 * passenger beside him, hands in her lap. Seeded from the paint, so each car keeps its people. Both figures merge into one set
 * of meshes (one draw per material). No sun-shadow twins: whatever sits inside falls within the hull's shadow.
 */
function occupants(s: Spec, paint: string) {
  const d = s.suv ? driverControls.suv : driverControls.hatchback, [hx, hy, hz] = d.hip, [wx, wy, wz] = d.wheel.centre;
  const { radius: r, tilt: t } = d.wheel, floor = hy - .22, pelvis = hy + .03;
  const hash = parseInt(paint.slice(1), 16) || 0;
  // Rim point `a` rad anticlockwise from 3 o'clock as the driver sees it (his right is -x); the palm faces the hub and forward.
  const rim = (a: number): V3 => [wx - r * Math.cos(a), wy + r * Math.sin(a) * Math.cos(t), wz + r * Math.sin(a) * Math.sin(t)];
  const palm = (a: number): V3 => [.6 * Math.cos(a), -.6 * Math.sin(a) * Math.cos(t) - .8 * Math.sin(t), -.6 * Math.sin(a) * Math.sin(t) + .8 * Math.cos(t)];
  const ankle = ([x, , z]: readonly number[]): V3 => [x, floor + .08, z - .1];
  const ten = Math.PI * 5 / 6, two = Math.PI / 6;
  const specs: OccupantSpec[] = [{ seed: [10, 3, 12, 8, 1, 7, 14, 5][hash % 8], pelvis: [hx, pelvis, hz], lean: -d.recline,
    hands: { left: rim(ten), right: rim(two) }, palms: { left: palm(ten), right: palm(two) },
    feet: { left: ankle(d.pedals.clutch), right: ankle(d.pedals.accelerator) } }];
  if (s.suv) specs.push({ seed: [4, 6, 9][hash % 3], pelvis: [-hx, pelvis, hz], lean: -d.recline, look: -.15,
    hands: { left: [-hx + .1, hy + .15, hz + .26], right: [-hx - .08, hy + .15, hz + .28] },
    feet: { left: [-hx + .12, floor + .08, hz + .62], right: [-hx - .1, floor + .08, hz + .64] } });
  const [people, ...others] = specs.map(occupantFigure);
  for (const other of others) for (const mesh of [...other.children] as T.Mesh[]) {
    const into = people.getObjectByName(mesh.name) as T.Mesh | undefined, merged = into && mergeGeometries([into.geometry, mesh.geometry]);
    if (!merged) { people.add(mesh); continue; }
    into.geometry.dispose(); mesh.geometry.dispose(); into.geometry = merged;
  }
  // Feet and shins in the footwell under the dash can't be seen from anywhere outside: drop them.
  const clothes = people.getObjectByName("Seated figure clothes") as T.Mesh, p = clothes.geometry.getAttribute("position"), index = clothes.geometry.index!;
  const hidden = (i: number) => p.getZ(i) > dashAt(s) - .3 && p.getY(i) < s.belt(dashAt(s)) - .2, kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (!hidden(a) || !hidden(b) || !hidden(c)) kept.push(a, b, c);
  }
  clothes.geometry.setIndex(kept);
  // The face decal draws before the tinted glass in front of it (both blend; equal-depth sorting would put it after).
  people.traverse(o => { if (o.name === "Seated figure face") o.renderOrder = -1; });
  return people;
}

/** Tyre with bulged sidewalls and tread grooves on a diamond-cut alloy (machined spoke faces and lip over gunmetal),
 * brake disc behind; axle along x, outer face +x. */
function alloyWheel(s: Spec) {
  const pieces: Parts = [], R = s.tyre, W = s.tread / 2, rim = s.rim, wall = R - rim, gunmetal = "#3a3e41", machined = "#d3d7d9";
  const turn = (color: string, points: number[][], n = 24) =>
    part(pieces, new T.LatheGeometry(points.map(([r, a]) => new T.Vector2(r, a)), n).rotateZ(-Math.PI / 2), color);
  const outer = [[R, W * .2], [R - .008, W * .24], [R - .008, W * .38], [R, W * .42], [R, W * .68], [R - .01, W * .84],
    [R - wall * .25, W * .98], [rim + wall * .35, W * 1.02], [rim + .004, W * .8]];
  turn("#1b1c1d", [[rim + .004, -W * .8], [R - wall * .3, -W], [R, -W * .62], ...outer], 32);
  // Machined lip, gunmetal barrel; five double spokes, tapered and dished in to the hub; cap and wheel nuts.
  turn(machined, [[rim + .006, W * .86], [rim + .013, W * .8], [rim + .002, W * .74], [rim - .008, W * .7]]);
  turn(gunmetal, [[rim - .008, W * .7], [rim - .014, W * .5], [rim - .016, -W * .7], [rim - .004, -W * .86]], 20);
  const len = rim - .065, mid = .055 + len / 2, tilt = Math.atan2(W * .3, len);
  for (let i = 0; i < 10; i++) {
    const a = (Math.floor(i / 2) + (i % 2 ? .07 : -.07)) * Math.PI * .4 + (i % 2 ? .05 : -.05);
    part(pieces, new T.CylinderGeometry(.021, .014, len, 4, 1).rotateY(Math.PI / 4), gunmetal, W * .48, mid * Math.cos(a), mid * Math.sin(a), 1, 1, 1, a, 0, -tilt);
    part(pieces, new T.BoxGeometry(.004, len * .96, .022), machined, W * .48 + .016, mid * Math.cos(a), mid * Math.sin(a), 1, 1, 1, a, 0, -tilt);
  }
  part(pieces, new T.CylinderGeometry(.065, .07, .028, 16).rotateZ(Math.PI / 2), gunmetal, W * .38);
  part(pieces, new T.CylinderGeometry(.032, .034, .012, 16).rotateZ(Math.PI / 2), machined, W * .55);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    part(pieces, new T.CylinderGeometry(.008, .008, .014, 6).rotateZ(Math.PI / 2), "#9ea2a3", W * .5, .048 * Math.cos(a), .048 * Math.sin(a));
  }
  part(pieces, new T.CylinderGeometry(rim * .74, rim * .74, .02, 24, 1, true).rotateZ(Math.PI / 2), "#6f7273", -W * .1);
  part(pieces, new T.CylinderGeometry(rim * .74, rim * .74, .002, 24).rotateZ(Math.PI / 2), "#77797a", -W * .1 + .01);
  return mergeGeometries(pieces)!;
}

export function car(parent: T.Group, paint: string, suv: boolean, shadowMaterial: T.Material) {
  const group = new T.Group(); group.name = suv ? "Moving crossover" : "Moving saloon";
  parent.add(group);
  const s = suv ? crossover() : hatchback(), H = s.half, bendTo = bender(s), levels = [.3, .42, .54, .65, .73, s.crease - .025, s.crease, s.crease + .05];
  // A coarse hidden hull of the same body casts the moving sun shadow, so the detailed one need not be drawn twice.
  const hull = sink(), hullKit = kitOf(), coarse = stations(s.outline, .3, 2);
  coachwork(hull, s, coarse, paint, 1, 2, false);
  flanks(hull, paint, coarse, s, [.45, s.crease]);
  hull.into(hullKit);
  const shade = new T.Mesh(bend(mergeGeometries(hullKit.paint)!, bendTo), new T.MeshBasicMaterial());
  shade.visible = false; group.add(shade);
  castSunShadow(group);

  const kit = kitOf(), out = sink(), st = stations(s.outline, .13, 5);
  coachwork(out, s, st, paint, 4, 6, true);
  // Flanks: painted sides round the daylight opening, gloss-black seals and B-pillar, glass set in behind.
  const seal = pane(st, s.belt, s.seal, .018, .002), panes = s.panes.map(p => pane(st, s.belt, p, .032, .014));
  flanks(out, paint, st, s, levels.filter(y => y < s.belt(0) - .02), seal);
  for (const k of sides) slab(kit.paint, black, seal, k * (H - .012), k * H, panes);
  for (const glass of panes) onFlank(out, "glass", tint, new T.Shape(profile(glass).map(([z, y]) => new T.Vector2(z, y))), H - .008);
  details(kit, out, s, st, paint, seal);
  out.into(kit);
  group.add(occupants(s, paint));
  const [body, plastic, glass, lens] = (["paint", "plastic", "glass", "lamp"] as Finish[]).map(finish => {
    const g = bend(mergeGeometries(kit[finish])!, bendTo);
    kit[finish].forEach(x => x.dispose());
    return g;
  });
  // Solid whites are a single glossy coat; every other colour is a metallic under clear coat.
  const solid = new T.Color(paint).getHSL({ h: 0, s: 0, l: 0 }).l > .78;
  assemble(group, [body], vehicleFinish("paint", solid ? { metalness: .02, roughness: .26 } : { metalness: .35, roughness: .3 }));
  assemble(group, [plastic], vehicleFinish("plastic"));
  assemble(group, [glass], vehicleFinish("glass", { transparent: true, opacity: .8, depthWrite: false }));
  lamps(group, [lens]);
  const wheels = new T.InstancedMesh(alloyWheel(s), vehicleFinish("rubber", { roughness: .5, metalness: .4, envMapIntensity: .8 }), 4);
  wheels.instanceMatrix.setUsage(T.DynamicDrawUsage);
  wheels.frustumCulled = false; wheels.receiveShadow = true;
  group.add(wheels);
  roadShadow(group, shadowMaterial, 2 * H + .2, s.length + .25);
  const temp = new T.Object3D();
  return function update(point: T.Vector3, heading: number, distance: number) {
    group.position.set(point.x, .032, point.z); group.rotation.y = heading;
    const spin = (distance / s.tyre) % (2 * Math.PI);
    let i = 0;
    for (const k of sides) for (const z of s.axles) {
      temp.position.set(k * s.track, s.tyre, z); temp.rotation.set(spin, k < 0 ? Math.PI : 0, 0);
      temp.updateMatrix(); wheels.setMatrixAt(i++, temp.matrix);
    }
    wheels.instanceMatrix.needsUpdate = true;
  };
}
