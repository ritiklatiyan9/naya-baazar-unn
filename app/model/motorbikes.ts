import * as T from "three";
import { castSunShadow } from "./realism";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { headGeometry } from "./shopperAppearance";
import { assemble, box, lamps, part, roadShadow, vehicleFinish } from "./vehicleGeometry";

type V3 = [number, number, number];
type Parts = T.BufferGeometry[];
type Surface = (u: number, v: number) => V3;
/** Parts bucketed by finish; every bucket merges into a single draw call. */
type Kit = Record<"paint" | "chrome" | "metal" | "matte" | "lamp" | "glass", Parts>;
/** A spinning wheel: its parts are centred on the axle. */
type Axle = { z: number; r: number; parts: Parts };

const up = new T.Vector3(0, 1, 0), vec = (p: V3) => new T.Vector3(...p);
const mix = T.MathUtils.lerp, rake = .47;
const rubber = "#1f2021", black = "#1b1c1e", steel = "#dfe1e2", alloy = "#b3b6b4", amber = "#f2a33a", red = "#c8322b";
/** Superellipse term: exponents below 1 square the section off, above 1 point it. */
const sp = (c: number, e: number) => Math.sign(c) * Math.abs(c) ** e;
/** Quarter-circle rounding over the first w of t, for closing lofted ends. */
const cap = (t: number, w: number) => Math.sqrt(1 - (1 - Math.min(Math.max(t, 0) / w, 1)) ** 2);

/** Smooth Catmull-Rom profile through evenly spaced keys, sampled at t in [0, 1]. */
function keyed(...keys: number[]) {
  const spline = new T.SplineCurve(keys.map((k, i) => new T.Vector2(i, k)));
  return (t: number) => spline.getPoint(T.MathUtils.clamp(t, 0, 1)).y;
}

/** Parametric patch (u across, v along); welded seams and poles keep the shading smooth. */
function sheet(cols: number, rows: number, at: Surface) {
  const position: number[] = [], index: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    position.push(...at(c / cols, r / rows));
    const i = r * (cols + 1) + c;
    if (r < rows && c < cols) index.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
  }
  const raw = new T.BufferGeometry();
  raw.setAttribute("position", new T.Float32BufferAttribute(position, 3)); raw.setIndex(index);
  const g = mergeVertices(raw); raw.dispose(); g.computeVertexNormals();
  return g;
}
/** A patch lifted off a surface along its normal: knee pads, lenses and trims that follow a panel.
 * Oval (soft squircle) patches span the same box, cols around the rim and rows out from a domed centre. */
function onto(at: Surface, u0: number, u1: number, v0: number, v1: number, lift: number, cols = 6, rows = 6, oval = false) {
  return sheet(cols, rows, (a, b) => {
    const [x, y] = oval ? [.5 + b * sp(Math.cos(a * 2 * Math.PI), .6) / 2, .5 + b * sp(Math.sin(a * 2 * Math.PI), .6) / 2] : [a, b];
    const u = mix(u0, u1, x), v = mix(v0, v1, y), p = vec(at(u, v));
    const n = vec(at(u + 1e-4, v)).sub(p).cross(vec(at(u, v + 1e-4)).sub(p)).normalize();
    return p.addScaledVector(n, oval ? lift * (2.5 - 1.5 * b * b) : lift).toArray();
  });
}
/** Surface of revolution about the x axis from [radius, x] profile points. */
const spun = (profile: number[][], segments: number) =>
  new T.LatheGeometry(profile.map(([r, x]) => new T.Vector2(r, x)), segments).rotateZ(-Math.PI / 2);
/** Turns a geometry built along +x to face along `axis`. */
const aim = (g: T.BufferGeometry, axis: V3) =>
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 0, 0), vec(axis).normalize()));
const along = (dir: T.Vector3) => new T.Quaternion().setFromUnitVectors(up, dir.clone().normalize());

/** Tapered capsule from a to b: limbs, levers, fork legs. */
function limb(parts: Parts, color: string, a: V3, b: V3, r1: number, r2 = r1, radial = 8) {
  const dir = vec(b).sub(vec(a)), arc = [0, Math.PI / 4, Math.PI / 2];
  part(parts, new T.LatheGeometry([
    ...arc.map(t => new T.Vector2(r1 * Math.sin(t), -r1 * Math.cos(t))),
    ...arc.map(t => new T.Vector2(r2 * Math.cos(t), dir.length() + r2 * Math.sin(t))),
  ], radial).applyQuaternion(along(dir)), color, ...a);
}
/** Straight rod with flat ends (open ones for spokes and sleeves), radius r at a and rb at b. */
function wire(parts: Parts, color: string, a: V3, b: V3, r: number, sides = 6, open = false, rb = r) {
  const dir = vec(b).sub(vec(a)), mid = vec(a).lerp(vec(b), .5);
  part(parts, new T.CylinderGeometry(rb, r, dir.length(), sides, 1, open).applyQuaternion(along(dir)), color, mid.x, mid.y, mid.z);
}
/** Tube through points: frame, exhaust, bars and rails. */
function pipe(parts: Parts, color: string, points: V3[], r: number, radial = 6) {
  const path = new T.CatmullRomCurve3(points.map(vec));
  part(parts, new T.TubeGeometry(path, Math.ceil(path.getLength() / .06), r, radial), color);
}
function rounded(parts: Parts, color: string, [x, y, z]: V3, [w, h, d]: V3, radius: number, rx = 0, ry = 0, rz = 0) {
  part(parts, new RoundedBoxGeometry(w, h, d, 1, radius), color, x, y, z, 1, 1, 1, rx, ry, rz);
}
/** Rounded slab from a closed side outline of (z, y) points, extruded across the bike about x = 0. */
function slab(outline: number[][], width: number, bevel: number) {
  const path = new T.CatmullRomCurve3(outline.map(([z, y]) => new T.Vector3(z, y, 0)), true);
  const g = new T.ExtrudeGeometry(new T.Shape(path.getPoints(22).map(p => new T.Vector2(p.x, p.y))),
    { depth: width - 2 * bevel, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, bevel - width / 2).rotateY(-Math.PI / 2);
  g.deleteAttribute("uv"); g.deleteAttribute("normal");
  const smooth = mergeVertices(g); g.dispose(); smooth.computeVertexNormals();
  return smooth;
}
/** Elbow or knee between a and b for bone lengths l1 and l2, bowed toward hint. */
function bend(a: V3, b: V3, l1: number, l2: number, hint: V3): V3 {
  const axis = vec(b).sub(vec(a)), d = Math.min(axis.length(), l1 + l2 - .001);
  axis.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  return vec(a).addScaledVector(axis, x)
    .addScaledVector(vec(hint).projectOnPlane(axis).normalize(), Math.sqrt(Math.max(0, l1 * l1 - x * x))).toArray();
}
/** Mudguard shell: theta runs from the front (negative) over the top to the rear, the section is a shallow C. */
function guard(axleY: number, axleZ: number, radius: number, from: number, to: number, half: number, drop: number): Surface {
  const rho = (half * half + drop * drop) / (2 * drop), spread = Math.asin(half / rho);
  return (u, v) => {
    const phi = (u * 2 - 1) * spread, theta = mix(from, to, v), r = radius - rho * (1 - Math.cos(phi));
    return [rho * Math.sin(phi), axleY + r * Math.cos(theta), axleZ - r * Math.sin(theta)];
  };
}
/** Static tyre (its spin is invisible): a round section from bead to bead. */
function tyre(parts: Parts, z: number, radius: number, bead: number, half: number) {
  const h = radius - bead, section = [[bead + .002, -half * .56]];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8 - .5) * 4.4;
    section.push([bead + h * (.42 + .58 * Math.cos(a)), half * Math.sin(a)]);
  }
  section.push([bead + .002, half * .56]);
  part(parts, spun(section, 24), rubber, 0, radius, z);
}
/** Rim channel the tyre beads sit in. */
const rim = (bead: number, lip: number) => spun([[bead + .011, -lip], [bead + .001, -lip - .003], [bead - .009, -lip * .7],
  [bead - .013, 0], [bead - .009, lip * .7], [bead + .001, lip + .003], [bead + .011, lip]], 24);
/** Coil spring wound along a to b. */
function spring(parts: Parts, color: string, a: V3, b: V3, radius: number, turns: number) {
  const dir = vec(b).sub(vec(a)), side = new T.Vector3(1, 0, 0).projectOnPlane(dir).normalize(), other = dir.clone().normalize().cross(side);
  const points: V3[] = [];
  for (let i = 0; i <= turns * 6; i++) {
    const t = i / (turns * 6), a2 = t * turns * Math.PI * 2;
    points.push(vec(a).addScaledVector(dir, t).addScaledVector(side, Math.cos(a2) * radius).addScaledVector(other, Math.sin(a2) * radius).toArray());
  }
  part(parts, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(vec)), turns * 6, .0045, 3), color);
}

/** Classic single-cylinder roadster: cradle frame, teardrop tank, finned barrel, long silencer on the right. */
function roadster(k: Kit, paint: string): Axle[] {
  const zF = .705, rF = .322, zR = -.68, rR = .325, front: Parts = [], rear: Parts = [];
  const dir = new T.Vector3(0, Math.cos(rake), -Math.sin(rake));
  const fork = (s: number, ahead = 0, x = 0): V3 =>
    [x, rF + s * Math.cos(rake) + ahead * Math.sin(rake), zF - s * Math.sin(rake) + ahead * Math.cos(rake)];
  const frontGuard = guard(rF, zF, .36, -1.25, .78, .062, .028), rearGuard = guard(rR, zR, .372, -.3, 1.95, .085, .035);

  // 19in front and 18in rear on chrome rims, each laced with 36 crossed spokes.
  tyre(k.matte, zF, rF, .2413, .045); tyre(k.matte, zR, rR, .2286, .058);
  const lace = (parts: Parts, bead: number, hubs: number[][]) => {
    part(parts, rim(bead, .025), steel);
    for (let i = 0; i < 36; i++) {
      const [x, r] = hubs[i % 2], a = i * Math.PI / 18, cross = (i >> 1) % 2 ? .52 : -.52;
      wire(parts, steel, [x, r * Math.cos(a + cross), r * Math.sin(a + cross)],
        [Math.sign(x) * .006, (bead - .013) * Math.cos(a), (bead - .013) * Math.sin(a)], .0019, 3, true);
    }
  };
  lace(front, .2413, [[-.046, .06], [.046, .06]]);
  lace(rear, .2286, [[-.05, .088], [.05, .06]]);
  part(front, spun([[.012, -.085], [.03, -.075], [.064, -.052], [.064, -.042], [.034, -.032], [.034, .032], [.064, .042],
    [.064, .052], [.03, .075], [.012, .085]], 12), steel);
  part(front, spun([[.078, -.066], [.135, -.066], [.135, -.071], [.078, -.071]], 22), "#a9acae");
  part(rear, spun([[.012, -.1], [.04, -.097], [.09, -.088], [.096, -.075], [.096, -.042], [.07, -.035], [.038, -.03],
    [.036, .03], [.064, .044], [.064, .054], [.034, .066], [.028, .085], [.012, .088]], 12), steel);
  part(rear, spun([[.07, .083], [.104, .083], [.104, .089], [.07, .089]], 20), "#4a4844");
  part(k.metal, spun([[0, -.106], [.06, -.104], [.094, -.098], [.098, -.086]], 14), alloy, 0, rR, zR);
  wire(k.metal, alloy, [-.1, rR + .05, zR + .02], [-.095, .37, -.42], .008);
  box(k.metal, "#55585a", -.068, rF + .085, zF - .075, .03, .07, .045, .7);

  // Telescopic fork: alloy sliders, rubber gaiters, chrome stanchions, painted headlamp shrouds.
  for (const s of [-1, 1]) {
    const x = s * .088, foot: V3 = [x * .9, ...fork(.03, -.01).slice(1)] as V3;
    limb(k.metal, alloy, fork(-.04, 0, x), fork(.26, 0, x), .029, .027, 10);
    part(k.matte, new T.LatheGeometry(Array.from({ length: 7 }, (_, i) => new T.Vector2(i % 2 ? .034 : .029, i * .027)), 8)
      .applyQuaternion(along(dir)), rubber, ...fork(.26, 0, x));
    wire(k.chrome, steel, fork(.41, 0, x), fork(.55, 0, x), .019, 10, true);
    limb(k.paint, paint, fork(.53, 0, x), fork(.73, 0, x), .032, .03, 10);
    for (const v of [.15, .82]) wire(k.chrome, steel, foot, frontGuard(s > 0 ? 1 : 0, v), .005, 5);
  }
  box(k.metal, black, ...fork(.535, -.02), .235, .03, .075, -rake);
  rounded(k.metal, alloy, fork(.735, -.02), [.235, .025, .075], .01, -rake);
  part(k.paint, sheet(6, 14, frontGuard), paint);

  // Round headlamp in a chrome bezel under a small visor, speedo on the nacelle, wide swept bar.
  const lamp = fork(.6, .105);
  const facing = (parts: Parts, profile: number[][], color: string, segments = 18) =>
    part(parts, spun(profile, segments), color, ...lamp, 1, 1, 1, 0, -Math.PI / 2);
  facing(k.paint, [[0, -.115], [.05, -.11], [.08, -.09], [.098, -.055], [.102, -.012]], paint);
  facing(k.chrome, [[.101, -.016], [.107, -.004], [.104, .008], [.091, .012]], steel, 22);
  facing(k.lamp, [[.092, .004], [.065, .014], [.03, .019], [0, .02]], "#f6f0dd");
  part(k.paint, sheet(10, 2, (u, v) => {
    const a = mix(.45, Math.PI - .45, u), r = .109 + .004 * v;
    return [Math.cos(a) * r, lamp[1] + Math.sin(a) * r - .012 * v * v, lamp[2] - .03 + .065 * v];
  }), paint);
  for (const s of [-1, 1]) {
    wire(k.paint, paint, fork(.6, .01, s * .088), [s * .095, lamp[1], lamp[2] - .055], .013, 8);
    wire(k.matte, black, [s * .1, lamp[1] - .03, lamp[2] - .03], [s * .17, lamp[1] - .03, lamp[2] - .02], .007, 5);
    part(k.paint, new T.SphereGeometry(.5, 8, 6), amber, s * .185, lamp[1] - .03, lamp[2] - .015, .032, .032, .05);
  }
  const dial = fork(.77, .06), gauge: V3 = [0, .75, -.66];
  part(k.chrome, aim(spun([[0, -.028], [.033, -.026], [.04, -.011], [.042, .004], [.036, .007]], 14), gauge), steel, ...dial);
  part(k.lamp, aim(spun([[.036, .003], [0, .003]], 14), gauge), "#ebe6d6", ...dial);
  pipe(k.chrome, steel, [[-.39, 1.04, .222], [-.3, 1.036, .24], [-.2, 1.022, .29], [-.1, 1.004, .34], [0, 1, .352],
    [.1, 1.004, .34], [.2, 1.022, .29], [.3, 1.036, .24], [.39, 1.04, .222]], .011);
  for (const s of [-1, 1]) {
    box(k.metal, alloy, s * .04, .985, .36, .03, .04, .035);
    limb(k.matte, rubber, [s * .275, 1.037, .238], [s * .392, 1.041, .222], .0175, .0175, 10);
    box(k.metal, alloy, s * .245, 1.042, .255, .035, .03, .04);
    wire(k.metal, alloy, [s * .25, 1.045, .27], [s * .375, 1.043, .305], .0055, 5);
    wire(k.chrome, steel, [s * .235, 1.05, .25], [s * .29, 1.2, .235], .0055, 5);
    part(k.chrome, spun([[0, -.012], [.045, -.008], [.052, .004], [0, .006]], 14), steel, s * .3, 1.235, .23, 1, 1, 1, 0, Math.PI / 2);
  }

  // Teardrop tank: polar along z (front at v = 0), superelliptic sections that swell forward.
  const tank: Surface = (u, v) => {
    const a = -u * 2 * Math.PI, c = Math.cos(v * Math.PI), s = Math.sin(v * Math.PI) ** .7;
    return [(.148 + .032 * c) * s * sp(Math.cos(a), .75), .872 + .045 * c + (.1 + .02 * c) * s * sp(Math.sin(a), .8), .085 + .245 * c];
  };
  part(k.paint, sheet(18, 13, tank), paint);
  for (const u of [0, .5]) part(k.matte, onto(tank, u - .045, u + .035, .44, .62, .003, 16, 2, true), "#3a3b3c");
  const filler = tank(.75, .3);
  part(k.chrome, new T.CylinderGeometry(.034, .036, .016, 16), steel, filler[0], filler[1] + .004, filler[2]);

  // Gloss black cradle frame and swing-arm.
  wire(k.paint, black, fork(.5, -.045), fork(.76, -.045), .028, 10);
  pipe(k.paint, black, [fork(.53, -.07), [0, .58, .325], [0, .34, .265], [0, .19, .205]], .019);
  for (const s of [-1, 1]) {
    pipe(k.paint, black, [[0, .19, .205], [s * .055, .155, .15], [s * .07, .14, -.06], [s * .072, .17, -.2], [s * .075, .36, -.235],
      [s * .072, .5, -.24]], .016);
    pipe(k.paint, black, [[s * .05, .745, -.22], [s * .085, .725, -.42], [s * .09, .71, -.62], [s * .08, .705, -.8]], .013, 5);
    pipe(k.paint, black, [[s * .075, .37, -.235], [s * .088, .55, -.4], [s * .09, .705, -.53]], .013, 5);
    wire(k.paint, black, [s * .088, .37, -.225], [s * .088, rR, zR - .01], .019, 8);
    // Twin shocks: chrome damper and shroud around an exposed coil.
    const lo: V3 = [s * .118, .36, -.62], hi: V3 = [s * .118, .71, -.52], t = (f: number) => vec(lo).lerp(vec(hi), f).toArray() as V3;
    wire(k.chrome, steel, lo, t(.5), .016, 8);
    wire(k.chrome, steel, t(.72), hi, .023, 10, false, .02);
    spring(k.chrome, steel, t(.1), t(.76), .027, 5);
    // Footrests and pillion pegs with rubbers.
    wire(k.metal, alloy, [s * .08, .3, 0], [s * .15, .31, 0], .009);
    wire(k.matte, rubber, [s * .14, .312, 0], [s * .215, .315, 0], .013, 8);
    wire(k.metal, alloy, [s * .09, .43, -.47], [s * .14, .43, -.47], .008);
    wire(k.matte, rubber, [s * .135, .43, -.47], [s * .19, .43, -.47], .011, 8);
  }
  wire(k.paint, black, [-.09, .37, -.225], [.09, .37, -.225], .015, 8);
  wire(k.metal, alloy, [-.1, .29, -.03], [-.16, .3, .13], .007);
  wire(k.matte, rubber, [-.16, .3, .115], [-.16, .3, .17], .014, 8);
  wire(k.metal, alloy, [.1, .34, -.05], [.15, .32, .12], .007);
  wire(k.matte, rubber, [.13, .32, .12], [.18, .32, .12], .01, 8);
  wire(k.paint, black, [.085, .19, -.04], [.13, .2, -.32], .011);

  // Air-cooled single: rounded crankcase and covers in satin alloy, finned barrel and head.
  part(k.metal, slab([[.17, .3], [.13, .4], [.04, .44], [-.06, .42], [-.15, .39], [-.215, .32], [-.2, .23], [-.12, .175],
    [0, .16], [.11, .18], [.165, .235]], .17, .03), alloy);
  part(k.metal, slab([[.09, .3], [.05, .375], [-.05, .39], [-.17, .37], [-.235, .31], [-.21, .235], [-.1, .205],
    [.02, .215], [.075, .25]], .035, .012), "#d3d5d2", .1);
  part(k.metal, spun([[0, -.118], [.05, -.114], [.068, -.104], [.072, -.09]], 16), "#d3d5d2", 0, .31, .07);
  part(k.metal, spun([[0, -.112], [.045, -.108], [.06, -.099], [.063, -.085]], 16), "#d3d5d2", 0, .295, -.12);
  const base = new T.Vector3(0, .425, .055), axis = new T.Vector3(0, Math.cos(.14), Math.sin(.14));
  const bore = (t: number) => base.clone().addScaledVector(axis, t).toArray() as V3;
  wire(k.metal, "#6d706f", bore(0), bore(.19), .05, 12, true);
  for (let i = 0; i < 8; i++) part(k.metal, new T.CylinderGeometry(.088 - i * .0015, .088 - i * .0015, .0055, 16), "#a4a7a5", ...bore(.017 + i * .023), 1, 1, 1, .14);
  box(k.metal, "#7f8381", ...bore(.245), .15, .11, .13, .14);
  for (let i = 0; i < 5; i++) box(k.metal, "#a4a7a5", ...bore(.2 + i * .022), .205, .006, .175, .14);
  rounded(k.metal, alloy, bore(.315), [.13, .04, .11], .015, .14);
  wire(k.metal, alloy, [0, .6, -.06], [-.02, .59, -.15], .032, 10);
  wire(k.matte, black, [-.02, .59, -.15], [-.1, .58, -.24], .022, 8);

  // Chrome header sweeping under the engine into a long silencer on the right.
  pipe(k.chrome, steel, [[-.02, .675, .16], [-.05, .655, .235], [-.085, .56, .285], [-.105, .4, .275], [-.125, .26, .215],
    [-.148, .21, .09], [-.162, .215, -.08], [-.17, .245, -.25]], .021, 8);
  part(k.chrome, aim(spun([[.021, 0], [.03, .03], [.043, .09], [.045, .3], [.05, .66], [.052, .69], [.046, .715], [.018, .725],
    [.016, .76]], 16), [-.012, .09, -.73]), steel, -.17, .245, -.25);

  // Chain and guard on the left.
  wire(k.metal, "#3d3c3a", [.088, .345, -.12], [.088, .428, -.68], .006, 5, true);
  wire(k.metal, "#3d3c3a", [.088, .255, -.12], [.088, .222, -.68], .006, 5, true);
  part(k.metal, spun([[.03, .08], [.046, .08], [.046, .096], [.03, .096]], 14), "#4a4844", 0, .3, -.12);
  rounded(k.paint, black, [.09, .405, -.38], [.03, .02, .5], .008, .15);

  // Rear mudguard with tail lamp, white plate, indicators and grab rail.
  part(k.paint, sheet(6, 16, rearGuard), paint);
  // Black bracket bolted to the guard tip: plate below, tail lamp on top, indicators on stalks.
  box(k.paint, black, 0, .47, -1.035, .21, .12, .03, .2);
  box(k.matte, "#f2f1ea", 0, .474, -1.053, .195, .105, .006, .2);
  rounded(k.chrome, steel, [0, .556, -1.02], [.11, .05, .06], .015, .2);
  box(k.lamp, red, 0, .562, -1.051, .09, .034, .006, .2);
  for (const s of [-1, 1]) {
    wire(k.matte, black, [s * .09, .5, -1.03], [s * .16, .5, -1.03], .007, 5);
    part(k.paint, new T.SphereGeometry(.5, 8, 6), amber, s * .175, .5, -1.035, .032, .032, .05);
    wire(k.chrome, steel, [s * .088, .705, -.8], rearGuard(s > 0 ? .95 : .05, .6), .006, 5);
  }
  pipe(k.chrome, steel, [[.115, .74, -.44], [.125, .765, -.64], [.1, .775, -.78], [0, .78, -.84], [-.1, .775, -.78],
    [-.125, .765, -.64], [-.115, .74, -.44]], .01, 5);

  // Side panels (toolbox left, air box right) over a black battery box, then the split seat.
  for (const s of [-1, 1]) part(k.paint, slab([[-.17, .655], [-.4, .655], [-.43, .6], [-.4, .52], [-.3, .485], [-.19, .5], [-.16, .58]], .05, .016), paint, s * .128);
  rounded(k.paint, black, [0, .58, -.31], [.2, .17, .22], .02);
  part(k.matte, sheet(12, 9, cushion(-.1, -.48, .7, keyed(.78, .8, .8, .805, .812), keyed(.07, .135, .14, .14, .13))), "#2b2622");
  part(k.matte, sheet(12, 7, cushion(-.45, -.82, .725, keyed(.815, .832, .835, .83), keyed(.12, .12, .115, .1))), "#2b2622");
  return [{ z: zF, r: rF, parts: front }, { z: zR, r: rR, parts: rear }];
}
/** Upholstered seat lofted from z0 back to z1: flat base, domed top, rounded nose and tail. */
function cushion(z0: number, z1: number, base: number, top: (t: number) => number, half: (t: number) => number): Surface {
  return (u, v) => {
    const a = -u * 2 * Math.PI, end = cap(v, .14) * cap(1 - v, .1), lift = (sp(Math.sin(a), .5) + 1) / 2;
    return [half(v) * end * sp(Math.cos(a), .45), base + (top(v) - base) * lift * end, mix(z0, z1, v)];
  };
}

/** Indian 110-125 cc step-through scooter: monocoque panels, unit swing-arm engine on the left, silencer on the right. */
function stepThrough(k: Kit, paint: string): Axle[] {
  const zF = .655, rF = .2424, zR = -.615, rR = .217, front: Parts = [], rear: Parts = [], wheel = "#8f9396", trim = "#2a2c2e";
  const fork = (s: number, ahead = 0, x = 0): V3 =>
    [x, rF + s * Math.cos(rake) + ahead * Math.sin(rake), zF - s * Math.sin(rake) + ahead * Math.cos(rake)];

  // 12in front and 10in rear alloys: polished lip, five twin spokes, front disc on the left.
  tyre(k.matte, zF, rF, .1524, .046); tyre(k.matte, zR, rR, .127, .047);
  for (const [parts, bead] of [[front, .1524], [rear, .127]] as const) {
    part(parts, rim(bead, .024), "#c3c6c8");
    part(parts, spun([[.012, -.07], [.03, -.065], [.042, -.03], [.042, .03], [.03, .065], [.012, .07]], 12), wheel);
    for (let i = 0; i < 10; i++) {
      const spoke = Math.floor(i / 2) * Math.PI * .4, side = i % 2 ? 1 : -1;
      wire(parts, wheel, [0, .038 * Math.cos(spoke + side * .03), .038 * Math.sin(spoke + side * .03)],
        [0, (bead - .011) * Math.cos(spoke + side * .13), (bead - .011) * Math.sin(spoke + side * .13)], .009, 4, true);
    }
  }
  part(front, spun([[.055, .052], [.098, .052], [.098, .056], [.055, .056]], 24), "#a9acae");
  rounded(k.metal, "#55585a", [.062, rF + .07, zF - .055], [.03, .055, .04], .01, .7);

  // Telescopic fork into the apron; front mudguard rides on the sliders.
  for (const s of [-1, 1]) {
    limb(k.metal, trim, fork(-.03, 0, s * .072), fork(.24, 0, s * .072), .022, .021);
    limb(k.chrome, steel, fork(.22, 0, s * .072), fork(.45, 0, s * .072), .016);
  }
  part(k.paint, sheet(8, 16, guard(rF, zF, .272, -1.05, .5, .062, .03)), paint);

  // Apron: closed horizontal sections, raked shield with a central nose, wrapping back behind the wheel at floor level.
  const zFront = keyed(.405, .475, .55, .56, .52, .45), nose = keyed(.02, .05, .08, .09, .09, .08);
  const depth = keyed(.015, .04, .07, .09, .1, .11), width = keyed(.15, .18, .203, .214, .22, .205);
  const apron: Surface = (u, v) => {
    const a = u * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), edge = zFront(v) - nose(v);
    return [width(v) * sp(ca, .7), mix(.3, .95, v), sa > 0 ? edge + nose(v) * sa ** 1.3 : edge - depth(v) * (-sa) ** .25];
  };
  part(k.paint, sheet(24, 10, apron), paint);
  part(k.matte, onto(apron, .6, .9, .08, .92, -.003, 6, 6), trim);
  part(k.chrome, onto(apron, .238, .262, .58, .97, -.003, 2, 6), "#c9cdd0");
  part(k.matte, onto(apron, .225, .275, .48, .56, -.003, 3, 2), trim);
  part(k.matte, onto(apron, .19, .31, .3, .44, -.004, 4, 3), "#f2f1ea");
  for (const u of [.085, .415]) {
    part(k.paint, onto(apron, u - .045, u + .045, .78, .9, -.003, 10, 1, true), black);
    part(k.paint, onto(apron, u - .035, u + .035, .795, .885, -.004, 10, 2, true), amber);
  }

  // Handlebar cover housing the headlamp and speedo, grips, levers and mirrors.
  const cover: Surface = (u, v) => {
    const x = mix(-.25, .25, v), kk = 1 - Math.abs(x / .25) ** 2.2, end = cap(v, .03) * cap(1 - v, .03), a = -u * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    return [x, 1 + .02 * kk + (.032 + .06 * kk) * end * sp(sa, .8), .31 + .075 * kk + (.035 + (ca > 0 ? .14 : .1) * kk) * end * sp(ca, .7)];
  };
  part(k.paint, sheet(16, 14, cover), paint);
  part(k.paint, onto(cover, -.085, .065, .29, .71, .003, 20, 1, true), black);
  part(k.lamp, onto(cover, -.072, .052, .32, .68, .004, 20, 3, true), "#f4f1e6");
  part(k.paint, onto(cover, .62, .76, .38, .62, .003, 3, 3), "#14181b");
  part(k.lamp, onto(cover, .655, .725, .44, .56, .005, 2, 2), "#dfe6e2");
  for (const s of [-1, 1]) {
    limb(k.matte, rubber, [s * .245, 1, .315], [s * .332, 1, .31], .018, .018, 10);
    wire(k.metal, alloy, [s * .24, 1.008, .345], [s * .32, 1.004, .372], .006, 5);
    limb(k.matte, trim, [s * .19, 1.06, .3], [s * .25, 1.19, .28], .006, .006, 5);
    rounded(k.matte, trim, [s * .27, 1.21, .278], [.12, .075, .03], .014);
    rounded(k.metal, "#c7d0d4", [s * .27, 1.21, .262], [.105, .06, .004], .002);
  }

  // Floorboard with ribbed mat, under-skirt, rear body over the engine, long flat seat.
  rounded(k.paint, paint, [0, .265, .195], [.31, .07, .37], .02);
  rounded(k.matte, trim, [0, .205, .17], [.2, .07, .4], .02);
  rounded(k.matte, "#2a2b2c", [0, .302, .195], [.28, .006, .33], .003);
  for (let i = -3; i <= 3; i++) part(k.matte, new T.BoxGeometry(.012, .008, .31), "#2a2b2c", i * .04, .307, .195);
  const bodyTop = keyed(.64, .655, .662, .668, .672, .668, .645), bodyLow = keyed(.3, .335, .38, .42, .445, .48, .55);
  const bodyHalf = keyed(.14, .162, .182, .19, .186, .163, .105);
  const body: Surface = (u, v) => {
    const a = -u * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), end = cap(v, .06) * cap(1 - v, .08);
    const top = bodyTop(v), low = bodyLow(v), mid = (top + low) / 2;
    return [bodyHalf(v) * end * sp(ca, .55) * (1 - .22 * Math.max(0, -sa)), mid + (top - mid) * end * sp(sa, .6), mix(.06, -.92, v)];
  };
  part(k.paint, sheet(20, 18, body), paint);
  for (const u of [.075, .365]) part(k.matte, onto(body, u, u + .06, .1, .84, .003, 3, 10), trim);
  part(k.paint, onto(body, .55, .95, .905, .99, .003, 14, 1, true), black);
  part(k.lamp, onto(body, .6, .9, .92, .985, .004, 12, 2, true), red);
  for (const u of [.565, .935]) part(k.paint, onto(body, u - .025, u + .025, .91, .95, .005, 8, 1, true), amber);
  part(k.matte, sheet(16, 14, cushion(.09, -.74, .645, keyed(.75, .768, .772, .775, .778, .77), keyed(.13, .155, .16, .16, .15, .13))), "#2b2622");
  pipe(k.matte, trim, [[.16, .665, -.38], [.172, .675, -.62], [.12, .68, -.78], [0, .685, -.83], [-.12, .68, -.78],
    [-.172, .675, -.62], [-.16, .665, -.38]], .011);

  // Rear mudflap with the plate, unit engine and CVT casing with a single shock on the left, silencer on the right.
  part(k.matte, sheet(6, 10, guard(rR, zR, .25, .2, 1.5, .06, .025)), trim);
  rounded(k.matte, trim, [0, .44, -.85], [.2, .13, .01], .005, -.2);
  rounded(k.matte, "#f2f1ea", [0, .44, -.857], [.18, .1, .006], .003, -.2);
  part(k.metal, slab([[-.1, .27], [-.16, .34], [-.32, .345], [-.52, .32], [-.66, .27], [-.67, .18], [-.6, .14], [-.4, .15],
    [-.2, .17], [-.11, .21]], .075, .02), "#9da1a3", .105);
  rounded(k.metal, "#55585a", [0, .23, -.08], [.17, .13, .17], .03);
  rounded(k.matte, trim, [.085, .39, -.33], [.08, .09, .26], .025);
  const lo: V3 = [.122, .3, -.56], hi: V3 = [.122, .56, -.47], t = (f: number) => vec(lo).lerp(vec(hi), f).toArray() as V3;
  limb(k.metal, trim, lo, t(.55), .014);
  spring(k.chrome, "#b9443a", t(.12), t(.8), .024, 6);
  pipe(k.metal, "#55585a", [[-.03, .19, -.02], [-.08, .17, -.15], [-.12, .23, -.27]], .018);
  const can = vec([-.12, .27, -.26]), canAxis: V3 = [-.01, .06, -.54];
  part(k.metal, aim(spun([[.02, 0], [.05, .03], [.056, .08], [.056, .42], [.05, .47], [.02, .5], [.014, .54]], 16), canAxis), "#3a3c3e", ...can.toArray());
  part(k.chrome, sheet(6, 8, (u, v) => {
    const a = mix(-1.2, 1.4, u), c = can.clone().addScaledVector(vec(canAxis), .12 + .7 * v);
    return [c.x - Math.cos(a) * .064, c.y + Math.sin(a) * .064, c.z];
  }), steel);
  limb(k.paint, trim, [.11, .19, -.02], [.13, .17, -.3], .01);
  return [{ z: zF, r: rF, parts: front }, { z: zR, r: rR, parts: rear }];
}

type Pose = {
  seat: V3; lean: number; grip: V3; ankle: V3; toe: V3; fullFace: boolean;
  shirt: string; trousers: string; skin: string; hands: string; shoes: string; helmet: string;
};
/** Seated rider: lofted torso, capsule limbs bent to reach the grips and footrests, helmet over a real-scale head. */
function rider(k: Kit, o: Pose) {
  const [, sy, sz] = o.seat, c = Math.cos(o.lean), s = Math.sin(o.lean);
  // t runs up the spine from the hip joints, f forward of it.
  const at = (t: number, x = 0, f = 0): V3 => [x, sy + .075 + t * c - f * s, sz + t * s + f * c];
  part(k.matte, new T.SphereGeometry(.5, 12, 8), o.trousers, 0, sy + .085, sz - .015, .345, .175, .27);
  // Hips, waist, ribs, chest, armpits, shoulder line, then the trapezius sloping into the collar.
  const W = keyed(.155, .15, .156, .17, .186, .198, .2, .085), D = keyed(.11, .104, .11, .12, .126, .124, .1, .06);
  const F = keyed(0, .006, .012, .02, .022, .014, 0, .015);
  part(k.matte, sheet(16, 9, (u, v) => {
    const a = -u * 2 * Math.PI, t = mix(-.07, .5, v);
    return at(t, W(v) * sp(Math.cos(a), .75), F(v) + D(v) * sp(Math.sin(a), .8));
  }), o.shirt);
  const chin = at(.53, 0, .07);
  limb(k.matte, o.skin, at(.45, 0, .01), [0, chin[1] + .05, chin[2] - .035], .056, .05);
  wire(k.matte, o.shirt, at(.46, 0, .012), at(.525, 0, .006), .075, 12, true, .066);
  const helmet: V3 = [0, chin[1] + .13, chin[2] - .01];
  if (o.fullFace) {
    part(k.paint, new T.SphereGeometry(.5, 16, 9, 0, Math.PI * 2, 0, 2.5), o.helmet, ...helmet, .262, .285, .305, .2);
    part(k.paint, new T.SphereGeometry(.5, 12, 3, Math.PI / 2 - 1, 2, 1.12, .5), "#1d2327", ...helmet, .269, .292, .313, .2);
  } else {
    part(k.matte, headGeometry(), o.skin, ...chin);
    // Eyes and brows sit in the skull's eye sockets so the face reads through the visor.
    for (const x of [-1, 1]) {
      part(k.matte, new T.SphereGeometry(.5, 6, 4), "#2a211c", x * .036, chin[1] + .146, chin[2] + .088, .019, .01, .008);
      part(k.matte, new T.SphereGeometry(.5, 6, 4), "#2f2620", x * .038, chin[1] + .166, chin[2] + .091, .03, .007, .008, 0, 0, -x * .12);
    }
    part(k.paint, new T.SphereGeometry(.5, 18, 5, 0, Math.PI * 2, 0, 1.3), o.helmet, ...helmet, .255, .275, .29);
    part(k.paint, new T.SphereGeometry(.5, 14, 5, Math.PI / 2 + 1, Math.PI * 2 - 2, 1.3, .95), o.helmet, ...helmet, .255, .275, .29);
    part(k.glass, new T.SphereGeometry(.5, 12, 5, Math.PI / 2 - 1.15, 2.3, 1.1, 1), "#dfe8ea", ...helmet, .272, .29, .31);
    for (const x of [-1, 1]) wire(k.matte, "#3b3631", [x * .1, helmet[1] - .07, helmet[2] - .005], [x * .02, chin[1] - .006, chin[2] + .045], .004, 4);
  }
  for (const x of [-1, 1]) {
    const shoulder = at(.4, x * .19, -.005), grip: V3 = [x * o.grip[0], o.grip[1], o.grip[2]];
    const wrist: V3 = [grip[0] - x * .005, grip[1] + .028, grip[2] - .062];
    const elbow = bend(shoulder, wrist, .29, .27, [x * .45, -.8, -.2]);
    // A jacket sleeves the whole arm; a half-sleeve shirt ends in a hem above the bare elbow.
    const upper = (f: number) => vec(shoulder).lerp(vec(elbow), f).toArray() as V3;
    if (o.fullFace) limb(k.matte, o.shirt, shoulder, elbow, .056, .046);
    else {
      limb(k.matte, o.skin, upper(.3), elbow, .052, .046);
      limb(k.matte, o.shirt, shoulder, upper(.45), .064, .062);
      wire(k.matte, o.shirt, upper(.4), upper(.56), .065, 10, true, .061);
    }
    limb(k.matte, o.fullFace ? o.shirt : o.skin, elbow, wrist, .043, .032);
    part(k.matte, new T.SphereGeometry(.5, 8, 6), o.hands, grip[0], grip[1] + .01, grip[2] + .004, .1, .074, .09);
    limb(k.matte, o.hands, wrist, [grip[0] - x * .035, grip[1] + .022, grip[2] + .025], .013, .011, 6);
    const hip = at(0, x * .095, .02), ankle: V3 = [x * o.ankle[0], o.ankle[1], o.ankle[2]];
    const knee = bend(hip, ankle, .42, .42, [x * .3, .3, 1]);
    limb(k.matte, o.trousers, hip, knee, .08, .058, 9);
    limb(k.matte, o.trousers, knee, ankle, .055, .041, 8);
    limb(k.matte, o.shoes, [ankle[0], ankle[1] - .035, ankle[2] - .045], [x * o.toe[0], o.toe[1], o.toe[2]], .044, .037);
  }
}

/** Bike and rider merged by finish, with two independently spinning wheels. */
export function riddenBike(parent: T.Group, scooter: boolean, shadowMaterial: T.Material) {
  const group = new T.Group();
  group.name = scooter ? "Sage scooter with helmeted rider" : "Classic motorcycle with helmeted rider";
  parent.add(group);
  const k: Kit = { paint: [], chrome: [], metal: [], matte: [], lamp: [], glass: [] };
  // ponytail: a scooter carries little chrome, so it shares the satin draw and frees one for the clear visor.
  if (scooter) k.chrome = k.metal;
  const axles = scooter ? stepThrough(k, "#829a8e") : roadster(k, "#a65e45");
  rider(k, scooter ? {
    seat: [0, .772, -.2], lean: .06, grip: [.29, 1, .312], ankle: [.14, .39, .25], toe: [.15, .33, .43], fullFace: false,
    shirt: "#7d4450", trousers: "#495b5c", skin: "#b77f60", hands: "#b77f60", shoes: "#5e4d40", helmet: "#f2dbc0",
  } : {
    seat: [0, .8, -.3], lean: .25, grip: [.335, 1.04, .232], ankle: [.19, .395, -.03], toe: [.2, .335, .15], fullFace: true,
    shirt: "#596b81", trousers: "#4d515b", skin: "#a66e50", hands: "#2c2a28", shoes: "#3b3029", helmet: "#556c6a",
  });
  roadShadow(group, shadowMaterial, .9, scooter ? 2 : 2.3);
  const shadow = group.children[group.children.length - 1];
  const wheels = axles.map(axle => {
    const mesh = assemble(group, axle.parts, vehicleFinish(scooter ? "metal" : "chrome"));
    mesh.position.set(0, axle.r, axle.z);
    return mesh;
  });
  assemble(group, k.paint, vehicleFinish("paint"));
  if (!scooter) assemble(group, k.chrome, vehicleFinish("chrome"));
  assemble(group, k.metal, vehicleFinish("metal"));
  assemble(group, k.matte, vehicleFinish("plastic", { roughness: .78 }));
  lamps(group, k.lamp);
  if (k.glass.length) assemble(group, k.glass, vehicleFinish("glass", { transparent: true, opacity: .28, depthWrite: false }));
  castSunShadow(group);
  return (point: T.Vector3, heading: number, travel: number, bank: number) => {
    group.position.set(point.x, .034, point.z); group.rotation.set(0, heading, bank, "YXZ");
    shadow.rotation.set(-Math.PI / 2, 0, -bank, "ZYX"); // the bike leans over its contact line, the shadow stays on the road
    wheels.forEach((wheel, i) => { wheel.rotation.x = travel / axles[i].r; });
  };
}
