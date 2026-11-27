import * as T from "three";
import { castSunShadow } from "./realism";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { occupantFigure } from "./shoppers";
import { assemble, box, part, roadShadow, vehicleFinish } from "./vehicleGeometry";

type V3 = [number, number, number];
type Parts = T.BufferGeometry[];
type Surface = (u: number, v: number) => V3;

/** Finishes as [indirect light, roughness, metalness, clear coat, glow]. Each is one texel of the bike's finish maps that
 * its parts' UVs select, so one material, and one draw per rigid body, carries them all. */
const finishes = {
  paint: [1, .42, .3, 1, 0], // two-coat paint, as vehicleFinish("paint")
  chrome: [1, .14, 1, 0, 0],
  metal: [1, .4, .8, 0, 0], // satin alloy and steel
  cast: [1, .62, .55, 0, 0], // sand-cast engine casings: too rough to flash in the sun
  fins: [.3, .85, .3, 0, 0], // painted cylinder fins: matte, and their narrow gaps hide most of the sky
  matte: [.55, .78, 0, 0, 0], // moulded plastic and vinyl
  rubber: [.6, .84, 0, 0, 0],
  lamp: [1, .1, 0, 1, 1], // lenses lit in their own colour after dark
  lens: [1, .1, 0, 1, .12], // indicator lenses only catch the light
  bowl: [1, .05, 1, 0, 1], // headlamp reflector: a mirror by day, lit by its bulb at night
};
type Finish = keyof typeof finishes;
const finishNames = Object.keys(finishes) as Finish[];
/** Parts bucketed by finish; plates carry their own UVs into the registration print. */
type Kit = Record<Finish | "plate", Parts>;
const kit = (): Kit => ({ paint: [], chrome: [], metal: [], cast: [], fins: [], matte: [], rubber: [], lamp: [], lens: [], bowl: [], plate: [] });
/** A spinning wheel: its parts are centred on the axle. */
type Axle = { z: number; r: number; wheel: Kit };

const up = new T.Vector3(0, 1, 0), vec = (p: V3) => new T.Vector3(...p);
const mix = T.MathUtils.lerp, rake = .47;
/** Both bikes steer about the fork line through the front axle. */
const steering = new T.Vector3(0, Math.cos(rake), -Math.sin(rake));
const rubber = "#1f2021", black = "#1b1c1e", steel = "#dfe1e2", alloy = "#b3b6b4", amber = "#f2a33a", red = "#c8322b", cable = "#161718";
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
/** Point on a surface lifted d along its normal. */
function lifted(at: Surface, u: number, v: number, d: number) {
  const p = vec(at(u, v)), n = vec(at(u + 1e-4, v)).sub(p).cross(vec(at(u, v + 1e-4)).sub(p)).normalize();
  return p.addScaledVector(n, d);
}
/** A patch lifted off a surface along its normal: knee pads, lenses and trims that follow a panel.
 * Oval (soft squircle) patches span the same box, cols around the rim and rows out from a domed centre. */
function onto(at: Surface, u0: number, u1: number, v0: number, v1: number, lift: number, cols = 6, rows = 6, oval = false) {
  return sheet(cols, rows, (a, b) => {
    const [x, y] = oval ? [.5 + b * sp(Math.cos(a * 2 * Math.PI), .6) / 2, .5 + b * sp(Math.sin(a * 2 * Math.PI), .6) / 2] : [a, b];
    return lifted(at, mix(u0, u1, x), mix(v0, v1, y), oval ? lift * (2.5 - 1.5 * b * b) : lift).toArray();
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
/** Tube through points, one ring every `step` metres: frame, exhaust, bars, rails and cables. */
function pipe(parts: Parts, color: string, points: V3[], r: number, radial = 6, step = .06) {
  const path = new T.CatmullRomCurve3(points.map(vec));
  part(parts, new T.TubeGeometry(path, Math.ceil(path.getLength() / step), r, radial), color);
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
/** Mudguard shell: theta runs from the front (negative) over the top to the rear, the section is a shallow C. */
function guard(axleY: number, axleZ: number, radius: number, from: number, to: number, half: number, drop: number): Surface {
  const rho = (half * half + drop * drop) / (2 * drop), spread = Math.asin(half / rho);
  return (u, v) => {
    const phi = (u * 2 - 1) * spread, theta = mix(from, to, v), r = radius - rho * (1 - Math.cos(phi));
    return [rho * Math.sin(phi), axleY + r * Math.cos(theta), axleZ - r * Math.sin(theta)];
  };
}
/** Tyre centred on its axle: a round section from bead to bead under `count` tread blocks per row. A row is
 * [section angle from, to, slant, phase]; its blocks follow the crown, fill `fill` of their pitch and stand `lift`
 * proud, so the loaded tyre settles a millimetre into the road and its outline stays round. Block faces are scuffed
 * a shade lighter than the sidewalls, as on a used tyre. */
function tyre(parts: Parts, radius: number, bead: number, half: number, count: number, rows: number[][], fill = .66, lift = .0028) {
  const h = radius - bead - lift / 2;
  const ring = (a: number, d = 0) => {
    const n = Math.hypot(half * Math.cos(a), .58 * h * Math.sin(a));
    return [bead + h * (.42 + .58 * Math.cos(a)) + d * half * Math.cos(a) / n, half * Math.sin(a) + d * .58 * h * Math.sin(a) / n];
  };
  part(parts, spun([[bead + .002, -half * .56], ...Array.from({ length: 9 }, (_, i) => ring((i / 8 - .5) * 4.4)),
    [bead + .002, half * .56]], 24), rubber);
  for (const [a0, a1, slant, phase] of rows) for (let i = 0; i < count; i++) part(parts, sheet(4, 1, (u, v) => {
    const k = Math.round(u * 4), [r, x] = ring([a0, a0, (a0 + a1) / 2, a1, a1][k], k % 4 ? lift : 0);
    const theta = (i + phase + v * fill) * 2 * Math.PI / count + slant * x;
    return [x, r * Math.cos(theta), r * Math.sin(theta)];
  }), "#2d2e2f");
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
/** Flat number plate w x h facing +z before turning by rx, ry; its UVs span the registration print. */
function plate(k: Kit, w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0) {
  const g = new T.PlaneGeometry(w, h).toNonIndexed();
  const uv = Array.from(g.getAttribute("uv").array, (c, i) => i % 2 ? .505 + c * .49 : .005 + c * .99);
  part(k.plate, g, "#f7f7f2", x, y, z, 1, 1, 1, rx, ry);
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
}

let finishMaps: T.DataTexture[] | undefined;
/** [occlusion, roughness, metalness] and [clear coat, glow] maps: row 0 holds the finishes in order, row 1 the plates' film. */
function surfaceMaps() {
  const rows = [...finishNames.map(n => finishes[n]), ...finishNames.map(() => [1, .5, 0, 0, 0])];
  return finishMaps ??= [[0, 1, 2], [3, 4, 4]].map(channels => {
    const map = new T.DataTexture(new Uint8Array(rows.flatMap(f => [...channels.map(c => f[c] * 255), 255])), finishNames.length, 2);
    map.needsUpdate = true;
    return map;
  });
}
/** White private plate to the HSRP pattern (black border and characters, chromium hologram, blue IND) above the white
 * band every other part samples, so plates print in the bike's one material. */
function plateTexture(lines: string[]) {
  const canvas = document.createElement("canvas"), c = canvas.getContext("2d")!;
  canvas.width = canvas.height = 256;
  c.fillStyle = "#fff"; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = "#17191b"; c.lineWidth = 5; c.beginPath(); c.roundRect(6, 6, 244, 116, 9); c.stroke();
  c.fillStyle = "#a9b8c7"; c.fillRect(15, 15, 17, 13);
  c.save(); c.translate(31, 113); c.rotate(-Math.PI / 2);
  c.fillStyle = "#1f4b97"; c.font = "bold 15px Arial, Helvetica, sans-serif"; c.fillText("IND", 0, 0); c.restore();
  c.fillStyle = "#17191b"; c.font = "bold 50px Arial, Helvetica, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  lines.forEach((line, i) => c.fillText(line, 142, 39 + i * 52, 192));
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4;
  return map;
}
/** The bike's one material: finish and glow from the finish maps, plates printed with `registration`. */
function bikeMaterial(registration: string[]) {
  const [surface, coat] = surfaceMaps();
  const material = vehicleFinish("paint", { map: plateTexture(registration), aoMap: surface, roughnessMap: surface, metalnessMap: surface,
    roughness: 1, metalness: 1, clearcoatMap: coat, emissiveMap: coat, emissive: "#ffffff", emissiveIntensity: .06 });
  // Glow is the coat map's green channel; lit lenses shine in their own vertex colour.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>",
      "totalEmissiveRadiance *= texture2D( emissiveMap, vEmissiveMapUv ).g * vColor.rgb;");
  };
  return material;
}
/** Merges a kit into one mesh of the bike's material, each part's UVs on its finish texel. */
function bake(parent: T.Object3D, k: Kit, material: T.Material) {
  const pieces = finishNames.flatMap((name, i) => k[name].map(g => {
    const uv = new Float32Array(g.getAttribute("position").count * 2).map((_, j) => j % 2 ? .25 : (i + .5) / finishNames.length);
    return g.setAttribute("uv", new T.BufferAttribute(uv, 2));
  }));
  return assemble(parent, [...pieces, ...k.plate], material);
}

/** Classic single-cylinder roadster: cradle frame, teardrop tank, finned barrel, long silencer on the right, and the
 * Indian fittings: crash guard, saree guard and side stand on the left, cables down from the bars, HSRP plates.
 * Returns the steered front (fork, lamp, bars) and the two wheels; everything else goes into the body kit k. */
function roadster(k: Kit, paint: string) {
  const zF = .705, rF = .322, zR = -.68, rR = .325, f = kit(), front = kit(), rear = kit();
  const fork = (s: number, ahead = 0, x = 0): V3 =>
    [x, rF + s * Math.cos(rake) + ahead * Math.sin(rake), zF - s * Math.sin(rake) + ahead * Math.cos(rake)];
  const frontGuard = guard(rF, zF, .36, -1.25, .78, .062, .028), rearGuard = guard(rR, zR, .372, -.3, 1.95, .085, .035);

  // 19in front and 18in rear on chrome rims, each laced with 36 crossed spokes, under chevron-tread tyres.
  tyre(front.rubber, rF, .2413, .045, 26, [[.06, .62, 3, 0], [-.62, -.06, -3, .5]]);
  tyre(rear.rubber, rR, .2286, .058, 24, [[.06, .75, 4, 0], [-.75, -.06, -4, .5]]);
  const lace = (parts: Parts, bead: number, hubs: number[][]) => {
    part(parts, rim(bead, .025), steel);
    for (let i = 0; i < 36; i++) {
      const [x, r] = hubs[i % 2], a = i * Math.PI / 18, cross = (i >> 1) % 2 ? .52 : -.52;
      wire(parts, steel, [x, r * Math.cos(a + cross), r * Math.sin(a + cross)],
        [Math.sign(x) * .006, (bead - .013) * Math.cos(a), (bead - .013) * Math.sin(a)], .0019, 3, true);
    }
  };
  lace(front.chrome, .2413, [[-.046, .06], [.046, .06]]);
  lace(rear.chrome, .2286, [[-.05, .088], [.05, .06]]);
  part(front.chrome, spun([[.012, -.085], [.03, -.075], [.064, -.052], [.064, -.042], [.034, -.032], [.034, .032], [.064, .042],
    [.064, .052], [.03, .075], [.012, .085]], 12), steel);
  // 280 mm disc on the right, gripped by a twin-piston caliper behind the slider; drum and sprocket at the rear.
  part(front.metal, spun([[.078, -.066], [.135, -.066], [.135, -.071], [.078, -.071]], 22), "#a9acae");
  part(rear.chrome, spun([[.012, -.1], [.04, -.097], [.09, -.088], [.096, -.075], [.096, -.042], [.07, -.035], [.038, -.03],
    [.036, .03], [.064, .044], [.064, .054], [.034, .066], [.028, .085], [.012, .088]], 12), steel);
  part(rear.metal, spun([[.07, .083], [.104, .083], [.104, .089], [.07, .089]], 20), "#4a4844");
  part(k.cast, spun([[0, -.106], [.06, -.104], [.094, -.098], [.098, -.086]], 14), alloy, 0, rR, zR);
  wire(k.metal, alloy, [-.1, rR + .05, zR + .02], [-.095, .37, -.42], .008);
  box(f.metal, "#3d3f42", -.068, rF + .085, zF - .075, .034, .075, .048, .7);

  // Telescopic fork: alloy sliders, rubber gaiters, chrome stanchions, painted headlamp shrouds.
  for (const s of [-1, 1]) {
    const x = s * .088, foot: V3 = [x * .9, ...fork(.03, -.01).slice(1)] as V3;
    limb(f.metal, alloy, fork(-.04, 0, x), fork(.26, 0, x), .029, .027, 10);
    part(f.rubber, new T.LatheGeometry(Array.from({ length: 7 }, (_, i) => new T.Vector2(i % 2 ? .034 : .029, i * .027)), 8)
      .applyQuaternion(along(steering)), rubber, ...fork(.26, 0, x));
    wire(f.chrome, steel, fork(.41, 0, x), fork(.55, 0, x), .019, 10, true);
    limb(f.paint, paint, fork(.53, 0, x), fork(.73, 0, x), .032, .03, 10);
    for (const v of [.15, .82]) wire(f.chrome, steel, foot, frontGuard(s > 0 ? 1 : 0, v), .005, 5);
  }
  box(f.metal, black, ...fork(.535, -.02), .235, .03, .075, -rake);
  rounded(f.metal, alloy, fork(.735, -.02), [.235, .025, .075], .01, -rake);
  part(f.paint, sheet(6, 14, frontGuard), paint);
  // Front plate upright on a bracket at the guard's nose.
  const nose = frontGuard(.5, .3);
  box(f.paint, black, 0, nose[1] + .045, nose[2] + .033, .17, .088, .008);
  plate(f, .16, .08, 0, nose[1] + .045, nose[2] + .04);
  wire(f.paint, black, [0, nose[1] + .012, nose[2] + .03], nose, .006, 5);

  // Round headlamp in a chrome bezel under a small visor: an open parabolic reflector round a capped bulb, which is what
  // shows through a clear lens. Speedo on the nacelle, wide swept bar with switch cubes, levers and round mirrors.
  const lamp = fork(.6, .105);
  const facing = (parts: Parts, profile: number[][], color: string, segments = 18) =>
    part(parts, spun(profile, segments), color, ...lamp, 1, 1, 1, 0, -Math.PI / 2);
  facing(f.paint, [[0, -.115], [.05, -.11], [.08, -.09], [.098, -.055], [.102, -.012]], paint);
  facing(f.chrome, [[.101, -.016], [.107, -.004], [.104, .008], [.091, .012]], steel, 22);
  facing(f.bowl, [[.094, .006], [.072, -.013], [.046, -.027], [.02, -.035], [0, -.037]], "#eceeef", 22);
  facing(f.lamp, [[0, -.034], [.009, -.03], [.011, -.02], [.007, -.012], [0, -.01]], "#fff1d2", 8);
  facing(f.chrome, [[0, -.009], [.015, -.008], [.016, -.003], [0, -.001]], steel, 10);
  part(f.paint, sheet(10, 2, (u, v) => {
    const a = mix(.45, Math.PI - .45, u), r = .109 + .004 * v;
    return [Math.cos(a) * r, lamp[1] + Math.sin(a) * r - .012 * v * v, lamp[2] - .03 + .065 * v];
  }), paint);
  for (const s of [-1, 1]) {
    wire(f.paint, paint, fork(.6, .01, s * .088), [s * .095, lamp[1], lamp[2] - .055], .013, 8);
    wire(f.matte, black, [s * .1, lamp[1] - .03, lamp[2] - .03], [s * .17, lamp[1] - .03, lamp[2] - .02], .007, 5);
    part(f.lens, new T.SphereGeometry(.5, 8, 6), amber, s * .185, lamp[1] - .03, lamp[2] - .015, .032, .032, .05);
  }
  const dial = fork(.77, .06), gauge: V3 = [0, .75, -.66];
  part(f.chrome, aim(spun([[0, -.028], [.033, -.026], [.04, -.011], [.042, .004], [.036, .007]], 14), gauge), steel, ...dial);
  part(f.lamp, aim(spun([[.036, .003], [0, .003]], 14), gauge), "#ebe6d6", ...dial);
  pipe(f.chrome, steel, [[-.39, 1.04, .222], [-.3, 1.036, .24], [-.2, 1.022, .29], [-.1, 1.004, .34], [0, 1, .352],
    [.1, 1.004, .34], [.2, 1.022, .29], [.3, 1.036, .24], [.39, 1.04, .222]], .011);
  for (const s of [-1, 1]) {
    box(f.metal, alloy, s * .04, .985, .36, .03, .04, .035);
    limb(f.rubber, rubber, [s * .275, 1.037, .238], [s * .392, 1.041, .222], .0175, .0175, 10);
    box(f.metal, alloy, s * .245, 1.042, .255, .035, .03, .04);
    box(f.matte, black, s * .265, 1.042, .246, .022, .05, .05);
    wire(f.metal, alloy, [s * .25, 1.045, .27], [s * .375, 1.043, .305], .0055, 5);
    wire(f.chrome, steel, [s * .235, 1.05, .25], [s * .29, 1.2, .235], .0055, 5);
    part(f.chrome, spun([[0, -.012], [.045, -.008], [.052, .004], [0, .006]], 14), steel, s * .3, 1.235, .23, 1, 1, 1, 0, Math.PI / 2);
  }
  box(f.metal, "#2b2d30", -.228, 1.07, .262, .036, .024, .03);
  // Clutch cable from the left lever and the throttle pair from the right grip loop down past the headlamp to the frame;
  // the brake hose follows the right fork leg to the caliper, the speedometer drive the left one to the hub.
  pipe(f.matte, cable, [[.24, 1.05, .275], [.2, 1, .35], [.13, .93, .39], [.07, .86, .37]], .0035, 3, .1);
  pipe(k.matte, cable, [[.07, .86, .37], [.03, .76, .345], [.03, .62, .335], [.06, .5, .26], [.1, .44, .12]], .0035, 3, .1);
  pipe(f.matte, cable, [[-.27, 1.045, .262], [-.23, .99, .34], [-.14, .92, .39], [-.07, .86, .37]], .004, 3, .1);
  pipe(k.matte, cable, [[-.07, .86, .37], [-.05, .8, .28], [-.06, .76, .12], [-.07, .725, 0], [-.03, .63, -.07]], .004, 3, .1);
  pipe(f.matte, cable, [[-.228, 1.06, .28], [-.25, 1, .34], [-.19, .92, .41], fork(.55, -.05, -.1), fork(.3, -.055, -.1),
    fork(.15, -.05, -.085), [-.07, .445, .615]], .0045, 3, .1);
  pipe(f.matte, cable, [[.015, .995, .4], [.08, .93, .41], fork(.5, .045, .1), fork(.25, .05, .1), [.07, rF + .03, zF + .025]], .0035, 3, .1);

  // Teardrop tank: polar along z (front at v = 0), superelliptic sections that swell forward; knee pads, chrome badges.
  const tank: Surface = (u, v) => {
    const a = -u * 2 * Math.PI, c = Math.cos(v * Math.PI), s = Math.sin(v * Math.PI) ** .7;
    return [(.148 + .032 * c) * s * sp(Math.cos(a), .75), .872 + .045 * c + (.1 + .02 * c) * s * sp(Math.sin(a), .8), .085 + .245 * c];
  };
  part(k.paint, sheet(18, 13, tank), paint);
  for (const u of [0, .5]) {
    part(k.matte, onto(tank, u - .045, u + .035, .44, .62, .003, 16, 2, true), "#3a3b3c");
    part(k.chrome, onto(tank, u - .03, u + .03, .2, .36, .003, 12, 2, true), steel);
    part(k.paint, onto(tank, u - .022, u + .022, .225, .335, .0056, 12, 2, true), "#e9dcbd");
  }
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
    const lo: V3 = [s * .118, .36, -.62], hi: V3 = [s * .118, .71, -.52], t = (at: number) => vec(lo).lerp(vec(hi), at).toArray() as V3;
    wire(k.chrome, steel, lo, t(.5), .016, 8);
    wire(k.chrome, steel, t(.72), hi, .023, 10, false, .02);
    spring(k.chrome, steel, t(.1), t(.76), .027, 5);
    // Footrests and pillion pegs with rubbers.
    wire(k.metal, alloy, [s * .08, .3, 0], [s * .15, .31, 0], .009);
    wire(k.rubber, rubber, [s * .14, .312, 0], [s * .215, .315, 0], .013, 8);
    wire(k.metal, alloy, [s * .09, .43, -.47], [s * .14, .43, -.47], .008);
    wire(k.rubber, rubber, [s * .135, .43, -.47], [s * .19, .43, -.47], .011, 8);
  }
  wire(k.paint, black, [-.09, .37, -.225], [.09, .37, -.225], .015, 8);
  wire(k.metal, alloy, [-.1, .29, -.03], [-.16, .3, .13], .007);
  wire(k.rubber, rubber, [-.16, .3, .115], [-.16, .3, .17], .014, 8);
  wire(k.metal, alloy, [.1, .34, -.05], [.15, .32, .12], .007);
  wire(k.rubber, rubber, [.13, .32, .12], [.18, .32, .12], .01, 8);
  // Side stand folded back under the left footrest, foot tab outboard.
  wire(k.paint, black, [.085, .19, -.04], [.13, .2, -.32], .011);
  box(k.paint, black, .136, .2, -.332, .045, .012, .035, 0, 0, .3);

  // Air-cooled single: satin alloy crankcase under polished primary and timing covers, black cast-iron barrel under an
  // alloy head.
  part(k.cast, slab([[.17, .3], [.13, .4], [.04, .44], [-.06, .42], [-.15, .39], [-.215, .32], [-.2, .23], [-.12, .175],
    [0, .16], [.11, .18], [.165, .235]], .17, .03), "#a9aca9");
  part(k.chrome, slab([[.09, .3], [.05, .375], [-.05, .39], [-.17, .37], [-.235, .31], [-.21, .235], [-.1, .205],
    [.02, .215], [.075, .25]], .035, .012), "#d5d7d5", .1);
  part(k.chrome, spun([[0, -.118], [.05, -.114], [.068, -.104], [.072, -.09]], 16), "#d5d7d5", 0, .31, .07);
  part(k.chrome, spun([[0, -.112], [.045, -.108], [.06, -.099], [.063, -.085]], 16), "#d5d7d5", 0, .295, -.12);
  const base = new T.Vector3(0, .425, .055), axis = new T.Vector3(0, Math.cos(.14), Math.sin(.14));
  const bore = (t: number) => base.clone().addScaledVector(axis, t).toArray() as V3;
  wire(k.cast, "#2c2e30", bore(0), bore(.19), .05, 12, true);
  for (let i = 0; i < 8; i++) part(k.fins, new T.CylinderGeometry(.088 - i * .0015, .088 - i * .0015, .0055, 16), "#3b3d3f", ...bore(.017 + i * .023), 1, 1, 1, .14);
  box(k.cast, "#7f8381", ...bore(.245), .15, .11, .13, .14);
  for (let i = 0; i < 5; i++) box(k.fins, "#a3a6a4", ...bore(.2 + i * .022), .205, .006, .175, .14);
  rounded(k.metal, alloy, bore(.315), [.13, .04, .11], .015, .14);
  wire(k.metal, alloy, [0, .6, -.06], [-.02, .59, -.15], .032, 10);
  wire(k.matte, black, [-.02, .59, -.15], [-.1, .58, -.24], .022, 8);

  // Chrome header sweeping under the engine into a long silencer on the right.
  pipe(k.chrome, steel, [[-.02, .675, .16], [-.05, .655, .235], [-.085, .56, .285], [-.105, .4, .275], [-.125, .26, .215],
    [-.148, .21, .09], [-.162, .215, -.08], [-.17, .245, -.25]], .021, 8);
  part(k.chrome, aim(spun([[.021, 0], [.03, .03], [.043, .09], [.045, .3], [.05, .66], [.052, .69], [.046, .715], [.018, .725],
    [.016, .76]], 16), [-.012, .09, -.73]), steel, -.17, .245, -.25);
  // Chrome crash guard looping round the engine from the down tube to the cradle.
  const loop: V3[] = [[.06, .2, .19], [.17, .23, .22], [.27, .3, .28], [.29, .4, .33], [.25, .5, .36], [.13, .58, .372]];
  pipe(k.chrome, steel, [...loop, [0, .6, .375], ...loop.map(([x, y, z]): V3 => [-x, y, z]).reverse()], .011, 6, .08);

  // Chain and guard on the left, then the saree guard: a hoop over the wheel's upper front on stays from the axle,
  // braced to the pillion peg so a sari or dupatta cannot reach the spokes.
  wire(k.metal, "#3d3c3a", [.088, .345, -.12], [.088, .428, -.68], .006, 5, true);
  wire(k.metal, "#3d3c3a", [.088, .255, -.12], [.088, .222, -.68], .006, 5, true);
  part(k.metal, spun([[.03, .08], [.046, .08], [.046, .096], [.03, .096]], 14), "#4a4844", 0, .3, -.12);
  rounded(k.paint, black, [.09, .405, -.38], [.03, .02, .5], .008, .15);
  const saree = (R: number, a: number): V3 => [.17, rR + R * Math.sin(a), zR + R * Math.cos(a)];
  pipe(k.paint, black, Array.from({ length: 5 }, (_, i) => saree(.345, mix(.3, 1.5, i / 4))), .006, 4, .1);
  for (const a of [.3, .7, 1.1, 1.5]) wire(k.paint, black, saree(.09, a), saree(.345, a), .005, 4);
  pipe(k.paint, black, [saree(.09, .3), saree(.09, .9), saree(.09, 1.5)], .005, 4, .1);
  wire(k.paint, black, saree(.25, .3), [.14, .43, -.47], .005, 4);

  // Rear mudguard with tail lamp, plate, indicators and grab rail.
  part(k.paint, sheet(6, 16, rearGuard), paint);
  // Black bracket bolted to the guard tip: plate below, tail lamp on top, indicators on stalks.
  box(k.paint, black, 0, .47, -1.035, .21, .12, .03, .2);
  plate(k, .195, .098, 0, .474, -1.053, .2, Math.PI);
  rounded(k.chrome, steel, [0, .556, -1.02], [.11, .05, .06], .015, .2);
  box(k.lamp, red, 0, .562, -1.051, .09, .034, .006, .2);
  for (const s of [-1, 1]) {
    wire(k.matte, black, [s * .09, .5, -1.03], [s * .16, .5, -1.03], .007, 5);
    part(k.lens, new T.SphereGeometry(.5, 8, 6), amber, s * .175, .5, -1.035, .032, .032, .05);
    wire(k.chrome, steel, [s * .088, .705, -.8], rearGuard(s > 0 ? .95 : .05, .6), .006, 5);
  }
  pipe(k.chrome, steel, [[.115, .74, -.44], [.125, .765, -.64], [.1, .775, -.78], [0, .78, -.84], [-.1, .775, -.78],
    [-.125, .765, -.64], [-.115, .74, -.44]], .01, 5);

  // Side panels (toolbox left, air box right) over a black battery box, then the split seat.
  for (const s of [-1, 1]) part(k.paint, slab([[-.17, .655], [-.4, .655], [-.43, .6], [-.4, .52], [-.3, .485], [-.19, .5], [-.16, .58]], .05, .016), paint, s * .128);
  rounded(k.paint, black, [0, .58, -.31], [.2, .17, .22], .02);
  part(k.matte, sheet(12, 9, cushion(-.1, -.48, .7, keyed(.78, .8, .8, .805, .812), keyed(.07, .135, .14, .14, .13))), "#2b2622");
  part(k.matte, sheet(12, 7, cushion(-.45, -.82, .725, keyed(.815, .832, .835, .83), keyed(.12, .12, .115, .1))), "#2b2622");
  return { steer: f, axles: [{ z: zF, r: rF, wheel: front }, { z: zR, r: rR, wheel: rear }] as Axle[] };
}
/** Upholstered seat lofted from z0 back to z1: flat base, domed top, rounded nose and tail. */
function cushion(z0: number, z1: number, base: number, top: (t: number) => number, half: (t: number) => number): Surface {
  return (u, v) => {
    const a = -u * 2 * Math.PI, end = cap(v, .14) * cap(1 - v, .1), lift = (sp(Math.sin(a), .5) + 1) / 2;
    return [half(v) * end * sp(Math.cos(a), .45), base + (top(v) - base) * lift * end, mix(z0, z1, v)];
  };
}

/** Indian 110-125 cc step-through scooter: monocoque panels, unit swing-arm engine on the left, silencer on the right.
 * Returns the steered front (fork, guard, handlebar cover) and the two wheels; the rest goes into the body kit k. */
function stepThrough(k: Kit, paint: string) {
  const zF = .655, rF = .2424, zR = -.615, rR = .217, f = kit(), front = kit(), rear = kit(), wheel = "#37393c", trim = "#2a2c2e";
  const fork = (s: number, ahead = 0, x = 0): V3 =>
    [x, rF + s * Math.cos(rake) + ahead * Math.sin(rake), zF - s * Math.sin(rake) + ahead * Math.cos(rake)];

  // 12in front and 10in rear alloys: dark five twin spokes inside a machined lip, front disc on the left; block tread.
  tyre(front.rubber, rF, .1524, .046, 20, [[.05, .7, 5, 0], [-.7, -.05, -5, .5]]);
  tyre(rear.rubber, rR, .127, .047, 18, [[.05, .7, 5, 0], [-.7, -.05, -5, .5]]);
  for (const [w, bead] of [[front, .1524], [rear, .127]] as const) {
    part(w.metal, rim(bead, .024), "#c3c6c8");
    part(w.metal, spun([[.012, -.07], [.03, -.065], [.042, -.03], [.042, .03], [.03, .065], [.012, .07]], 12), wheel);
    for (let i = 0; i < 10; i++) {
      const spoke = Math.floor(i / 2) * Math.PI * .4, side = i % 2 ? 1 : -1;
      wire(w.metal, wheel, [0, .038 * Math.cos(spoke + side * .03), .038 * Math.sin(spoke + side * .03)],
        [0, (bead - .011) * Math.cos(spoke + side * .13), (bead - .011) * Math.sin(spoke + side * .13)], .009, 4, true);
    }
  }
  part(front.metal, spun([[.055, .052], [.098, .052], [.098, .056], [.055, .056]], 24), "#a9acae");
  rounded(f.metal, "#55585a", [.062, rF + .07, zF - .055], [.03, .055, .04], .01, .7);
  pipe(f.matte, cable, [[.064, rF + .1, zF - .07], fork(.15, -.04, .1), fork(.32, -.035, .09)], .0045, 3, .1);

  // Telescopic fork into the apron; front mudguard rides on the sliders.
  for (const s of [-1, 1]) {
    limb(f.metal, trim, fork(-.03, 0, s * .072), fork(.24, 0, s * .072), .022, .021);
    limb(f.chrome, steel, fork(.22, 0, s * .072), fork(.45, 0, s * .072), .016);
  }
  part(f.paint, sheet(8, 16, guard(rF, zF, .272, -1.05, .5, .062, .03)), paint);

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
  // Front plate on the apron's lower face, tilted to its rake.
  const face = lifted(apron, .25, .37, 0), out = lifted(apron, .25, .37, -1).sub(face), tilt = Math.atan2(-out.y, out.z);
  const backing = face.clone().addScaledVector(out, .006), print = face.clone().addScaledVector(out, .0125);
  box(k.matte, trim, 0, backing.y, backing.z, .172, .09, .008, tilt);
  plate(k, .16, .08, 0, print.y, print.z, tilt);
  for (const u of [.085, .415]) {
    part(k.paint, onto(apron, u - .045, u + .045, .78, .9, -.003, 10, 1, true), black);
    part(k.lens, onto(apron, u - .035, u + .035, .795, .885, -.004, 10, 2, true), amber);
  }

  // Handlebar cover housing the headlamp and speedo, grips, levers and mirrors. The headlamp is a domed reflector
  // patch: silvered by day like a clear lens over a mirror, lit at night.
  const cover: Surface = (u, v) => {
    const x = mix(-.25, .25, v), kk = 1 - Math.abs(x / .25) ** 2.2, end = cap(v, .03) * cap(1 - v, .03), a = -u * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    return [x, 1 + .02 * kk + (.032 + .06 * kk) * end * sp(sa, .8), .31 + .075 * kk + (.035 + (ca > 0 ? .14 : .1) * kk) * end * sp(ca, .7)];
  };
  part(f.paint, sheet(16, 14, cover), paint);
  part(f.paint, onto(cover, -.085, .065, .29, .71, .003, 20, 1, true), black);
  part(f.bowl, onto(cover, -.072, .052, .32, .68, .005, 20, 3, true), "#e6e9eb");
  part(f.paint, onto(cover, .62, .76, .38, .62, .003, 3, 3), "#14181b");
  part(f.lamp, onto(cover, .655, .725, .44, .56, .005, 2, 2), "#dfe6e2");
  for (const s of [-1, 1]) {
    limb(f.rubber, rubber, [s * .245, 1, .315], [s * .332, 1, .31], .018, .018, 10);
    wire(f.metal, alloy, [s * .24, 1.008, .345], [s * .32, 1.004, .372], .006, 5);
    limb(f.matte, trim, [s * .19, 1.06, .3], [s * .25, 1.19, .28], .006, .006, 5);
    rounded(f.matte, trim, [s * .27, 1.21, .278], [.12, .075, .03], .014);
    rounded(f.chrome, "#c7d0d4", [s * .27, 1.21, .262], [.105, .06, .004], .002);
  }

  // Floorboard with ribbed mat, under-skirt, rear body over the engine, long flat seat.
  rounded(k.paint, paint, [0, .265, .195], [.31, .07, .37], .02);
  rounded(k.matte, trim, [0, .205, .17], [.2, .07, .4], .02);
  rounded(k.rubber, "#2a2b2c", [0, .302, .195], [.28, .006, .33], .003);
  for (let i = -3; i <= 3; i++) part(k.rubber, new T.BoxGeometry(.012, .008, .31), "#2a2b2c", i * .04, .307, .195);
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
  for (const u of [.565, .935]) part(k.lens, onto(body, u - .025, u + .025, .91, .95, .005, 8, 1, true), amber);
  // Chrome garnish along each side panel.
  for (const u of [.558, .93]) part(k.chrome, onto(body, u, u + .012, .32, .78, .003, 1, 8), "#cfd3d6");
  part(k.matte, sheet(16, 14, cushion(.09, -.74, .645, keyed(.75, .768, .772, .775, .778, .77), keyed(.13, .155, .16, .16, .15, .13))), "#2b2622");
  pipe(k.matte, trim, [[.16, .665, -.38], [.172, .675, -.62], [.12, .68, -.78], [0, .685, -.83], [-.12, .68, -.78],
    [-.172, .675, -.62], [-.16, .665, -.38]], .011);
  // Pillion footrests: the right folded flat against the body, the left swung out under the side-saddle pillion's feet.
  box(k.matte, trim, -.19, .41, -.27, .022, .028, .1, 0, -.12);
  rounded(k.matte, trim, [.25, .41, -.3], [.13, .024, .085], .008);
  for (let i = -2; i <= 2; i++) box(k.rubber, rubber, .26, .424, -.3 + i * .015, .1, .006, .007);

  // Rear mudflap with the plate, unit engine and CVT casing with a single shock on the left, silencer on the right.
  part(k.matte, sheet(6, 10, guard(rR, zR, .25, .2, 1.5, .06, .025)), trim);
  rounded(k.matte, trim, [0, .44, -.85], [.2, .13, .01], .005, -.2);
  plate(k, .18, .09, 0, .44, -.858, -.2, Math.PI);
  // Cast CVT casing in dark grey: stiffening ribs, the round variator boss and a folded kick lever.
  part(k.cast, slab([[-.1, .27], [-.16, .34], [-.32, .345], [-.52, .32], [-.66, .27], [-.67, .18], [-.6, .14], [-.4, .15],
    [-.2, .17], [-.11, .21]], .075, .02), "#64686b", .105);
  for (const [y, z0, z1] of [[.3, -.26, -.54], [.25, -.28, -.6], [.2, -.3, -.58]]) wire(k.cast, "#585b5e", [.144, y, z0], [.144, y - .012, z1], .005, 4);
  part(k.cast, new T.CylinderGeometry(.062, .066, .016, 18), "#6e7275", .146, .25, -.19, 1, 1, 1, 0, 0, -Math.PI / 2);
  wire(k.metal, "#2f3133", [.16, .26, -.2], [.168, .31, -.43], .008, 5);
  wire(k.rubber, rubber, [.168, .305, -.41], [.17, .32, -.47], .012, 6);
  rounded(k.metal, "#55585a", [0, .23, -.08], [.17, .13, .17], .03);
  rounded(k.matte, trim, [.085, .39, -.33], [.08, .09, .26], .025);
  const lo: V3 = [.122, .3, -.56], hi: V3 = [.122, .56, -.47], t = (at: number) => vec(lo).lerp(vec(hi), at).toArray() as V3;
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
  return { steer: f, axles: [{ z: zF, r: rF, wheel: front }, { z: zR, r: rR, wheel: rear }] as Axle[] };
}

/** Rider and pillion contact points for the riders, in each bike's frame (+z forward, +y up, the rider's left = +x),
 * metres, matching the geometry: `seat` and `pillionSeat` are the saddle surface under the pelvis, grips the middle of
 * each grip rubber, feet the top of each footrest rubber (motorcycle) or the floorboard mat under the ball of each foot
 * (scooter); the scooter's right pillion footrest is folded flat against the body, the left swung out. The grips turn with the bars about
 * `steer.axis` through `steer.pivot` by -bank radians (rider's left positive, at most .12 on the market loop). */
export const riderContacts = {
  motorcycle: {
    seat: [0, .8, -.3], gripLeft: [.334, 1.039, .23], gripRight: [-.334, 1.039, .23],
    footLeft: [.18, .327, 0], footRight: [-.18, .327, 0],
    pillionSeat: [0, .834, -.64], pillionFootLeft: [.163, .441, -.47], pillionFootRight: [-.163, .441, -.47],
    steer: { pivot: [0, .322, .705], axis: steering.toArray() },
  },
  scooter: {
    seat: [0, .772, -.2], gripLeft: [.289, 1, .312], gripRight: [-.289, 1, .312],
    footLeft: [.14, .311, .3], footRight: [-.14, .311, .3],
    pillionSeat: [0, .776, -.55], pillionFootLeft: [.26, .427, -.3], pillionFootRight: [-.2, .41, -.27],
    steer: { pivot: [0, .2424, .655], axis: steering.toArray() },
  },
} as const;

/** Bike in one finish-mapped material (the body, the front that steers into bends and two spinning wheels) carrying a
 * seated rider from the pedestrians' seeded people. */
export function riddenBike(parent: T.Group, scooter: boolean, shadowMaterial: T.Material) {
  const group = new T.Group();
  group.name = scooter ? "Sage scooter with helmeted rider" : "Classic motorcycle with helmeted rider";
  parent.add(group);
  const k = kit(), { steer, axles } = scooter ? stepThrough(k, "#829a8e") : roadster(k, "#a65e45");
  // The rider: a man in an open-face helmet on the scooter, in a full-face helmet and zipped riding jacket on the roadster.
  // In a market town the scooter often carries a woman too, side-saddle on the left in a salwar suit, a hand on the rider's
  // shoulder and her feet on the swung-out footrest.
  if (scooter) group.add(occupantFigure({
    seed: 9, pelvis: [.05, .85, -.55], lean: .02, yaw: 1.3, look: -1, outfit: "salwar",
    hands: { right: [.17, 1.34, -.1], left: [.27, .94, -.59] }, feet: { right: [.24, .49, -.26], left: [.255, .49, -.35] },
  }));
  group.add(occupantFigure(scooter ? {
    seed: 7, pelvis: [0, .85, -.13], lean: .12, hands: { left: [.289, 1, .312], right: [-.289, 1, .312] },
    feet: { left: [.125, .385, .27], right: [-.125, .385, .27] }, helmet: { style: "open-face", color: "#f2dbc0" },
  } : {
    seed: 3, pelvis: [0, .875, -.3], lean: .25, hands: { left: [.334, 1.039, .23], right: [-.334, 1.039, .23] },
    feet: { left: [.19, .395, -.03], right: [-.19, .395, -.03] }, helmet: { style: "full-face", color: "#2b2d31" }, outfit: "riding",
  }));
  roadShadow(group, shadowMaterial, .9, scooter ? 2 : 2.3);
  const shadow = group.children[group.children.length - 1];
  const material = bikeMaterial(scooter ? ["UP 19 AD", "3157"] : ["UP 19 AK", "4821"]);
  bake(group, k, material);
  const [front, rear] = axles, bars = new T.Group();
  bars.position.set(0, front.r, front.z);
  group.add(bars);
  bake(bars, steer, material).position.set(0, -front.r, -front.z);
  const wheels = [bake(bars, front.wheel, material), bake(group, rear.wheel, material)];
  wheels[1].position.set(0, rear.r, rear.z);
  castSunShadow(group);
  group.userData.night = (on: boolean) => { material.emissiveIntensity = on ? 2.6 : .06; };
  return (point: T.Vector3, heading: number, travel: number, bank: number) => {
    group.position.set(point.x, .034, point.z); group.rotation.set(0, heading, bank, "YXZ");
    shadow.rotation.set(-Math.PI / 2, 0, -bank, "ZYX"); // the bike leans over its contact line, the shadow stays on the road
    // ponytail: steers a fraction of the kinematic angle (wheelbase x g / v^2, about 3.5 x bank at market pace) so the
    // rider's fixed hands stay on the grips; full lock needs arms that follow the bars.
    bars.quaternion.setFromAxisAngle(steering, -bank);
    for (let i = 0; i < 2; i++) wheels[i].rotation.x = travel / axles[i].r;
  };
}
