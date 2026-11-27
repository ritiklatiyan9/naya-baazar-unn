import * as T from "three";
import { castSunShadow } from "./realism";
import { LoftGeometry } from "three/addons/geometries/LoftGeometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { assemble, box, lamps, oval, part, plate, profile, rod, slab, vehicleFinish, type Corner } from "./vehicleGeometry";

type Parts = T.BufferGeometry[];

// Tyre radius (stockDelivery spins the wheels by it), axle stations and wheel planes.
const R = .29, front = 1.2, rear = -1.24, track = .7;
const steel = "#26292a", black = "#1c1d1e", alloy = "#c4c9c8", red = "#c22a28", white = "#f1efe9", tinted = "#283633";

/** Lofts a side profile across ±half; every point rolls onto the flat sides over its own edge radius. */
function shell(bucket: Parts, color: string, points: number[][], half: number, steps = 3) {
  const area = points.reduce((sum, [z, y], i) => sum + z * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * y, 0);
  const ring = area > 0 ? [...points].reverse() : points, n = ring.length; // clockwise in (z, y) faces outwards
  const normals = ring.map((_, i) => {
    const [z0, y0] = ring[(i + n - 1) % n], [z1, y1] = ring[(i + 1) % n], l = Math.hypot(z1 - z0, y1 - y0);
    return [-(y1 - y0) / l, (z1 - z0) / l];
  });
  const sections: T.Vector3[][] = [];
  for (const side of [-1, 1]) for (let k = 0; k <= steps; k++) {
    const a = (side < 0 ? steps - k : k) / steps * Math.PI / 2;
    sections.push(ring.map(([z, y, r], i) => {
      const inset = r * (1 - Math.cos(a));
      return new T.Vector3(side * (half - r + r * Math.sin(a)), y - normals[i][1] * inset, z - normals[i][0] * inset);
    }));
  }
  part(bucket, new LoftGeometry(sections, { capStart: true, capEnd: true }), color);
}

/** Tumblehome: above the beltline the cab narrows towards the roof, its normals leaning with it. */
function tumblehome(g: T.BufferGeometry) {
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), v = new T.Vector3(), rise = .83, lean = .07;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - 1.14) / rise, s = 1 - lean * T.MathUtils.clamp(t, 0, 1), slope = t > 0 && t < 1 ? lean / rise : 0;
    v.set(n.getX(i) / s, n.getY(i) + p.getX(i) * slope / s * n.getX(i), n.getZ(i)).normalize();
    p.setX(i, p.getX(i) * s);
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function rbox(bucket: Parts, color: string, x: number, y: number, z: number, w: number, h: number, d: number, r: number, rx = 0, ry = 0) {
  part(bucket, new RoundedBoxGeometry(w, h, d, 1, r), color, x, y, z, 1, 1, 1, rx, ry);
}

/** Lathe-turned 155 R13 tyre on a dished steel disc wheel; axle along x, outer face towards +x. */
function wheelGeometry(segments: number) {
  const pieces: Parts = [];
  const turn = (color: string, points: number[][], n: number) =>
    part(pieces, new T.LatheGeometry(points.map(([r, a]) => new T.Vector2(r, a)), n).rotateZ(-Math.PI / 2), color);
  const half = [[.17, -.058], [.19, -.076], [.235, -.081], [.27, -.074], [.285, -.058], [R, -.04], [R, -.013], [.2855, -.009]];
  turn("#202122", [...half, ...half.map(([r, a]) => [r, -a]).reverse()], segments);
  // Rim flange and well, then the disc dished out to a raised nut boss and a dark hub cap.
  turn("#9aa09f", [[.178, .05], [.172, .062], [.163, .06], [.156, .046], [.15, .03], [.142, .028], [.12, .034], [.095, .042],
    [.082, .056], [.068, .062], [.04, .062]], Math.max(12, segments - 8));
  turn("#5c6261", [[.04, .062], [.036, .068], [.028, .074], [0, .076]], 12);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4, b = a + Math.PI * .2;
    part(pieces, new T.CylinderGeometry(.011, .011, .02, 6).rotateZ(Math.PI / 2), "#c3c6c3", .07, .056 * Math.sin(a), .056 * Math.cos(a));
    // Ventilation holes read as dark recesses in the disc.
    part(pieces, new T.SphereGeometry(.5, 6, 4), "#1e2020", .036, .117 * Math.sin(b), .117 * Math.cos(b), .01, .046, .03, Math.PI / 2 - b);
  }
  return mergeGeometries(pieces);
}

/** Semi-forward steel cab, right-hand drive: driver, steering wheel and instrument binnacle at -x. */
function cab(paint: Parts, glass: Parts, plastic: Parts, lens: Parts, color: string, trim: string, roofLamps: boolean) {
  const W = .8, rake = Math.atan2(.332, .655); // windscreen leans back 27°
  const buckets = [paint, glass, plastic, lens], start = buckets.map(b => b.length);
  const arch: Corner[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = T.MathUtils.lerp(2.634, .302, i / 16);
    arch.push([front + .37 * Math.cos(a), .29 + .37 * Math.sin(a), i % 16 ? 0 : .02, .015]);
  }
  // One pressed shell: wheel arch, short nose, open glasshouse band between beltline and roof.
  // Convex fillets stay wider than their edge radii so the rolled sides never fold over.
  shell(paint, color, profile([[.45, .47, .075, .05], ...arch, [2.07, .4, .16, .11], [2.07, 1.08, .12, .1], [1.88, 1.14, .05, .05],
    [1.83, 1.14, 0, .022], [.6, 1.14, .025, .022], [.6, 1.795, .03, .022], [1.548, 1.795, .035, .01], [1.467, 1.955, .13, .05],
    [.45, 1.965, .09, .06]]), W);
  for (const x of [-.3, 0, .3]) box(paint, color, x, 1.962, .95, .07, .012, .7, -.0098); // roof pressings follow its fall
  // Windscreen with a black ceramic border behind it; rear window over a dark backing.
  box(glass, tinted, 0, 1.465, 1.704, 1.5, .76, .006, -rake);
  box(plastic, black, 0, 1.771, 1.544, 1.48, .07, .003, -rake);
  box(glass, tinted, 0, 1.56, .443, .96, .3, .005);
  box(plastic, black, 0, 1.56, .4472, .98, .32, .003);
  for (const s of [-1, 1]) {
    const out = s * (W + .0015);
    box(plastic, black, s * .72, 1.463, 1.7, .05, .76, .003, -rake);
    rod(paint, color, [s * .748, 1.15, 1.878], [s * .776, 1.81, 1.538], .03);
    slab(glass, tinted, [[.59, 1.128], [1.893, 1.128], [1.552, 1.807], [.59, 1.807]], s * .776, s * .781);
    box(plastic, black, s * .792, 1.47, 1.42, .02, .67, .03);
    box(plastic, black, s * (W - .011), 1.145, 1.245, .024, .014, 1.3);
    box(plastic, black, out, 1.47, .555, .003, .66, .09);
    // Door shut lines, handle, step and the trim band.
    box(plastic, "#3a3c3c", out, .865, 1.42, .003, .55, .006);
    box(plastic, "#3a3c3c", out, .8, .605, .003, .66, .006);
    rbox(plastic, black, s * (W + .012), 1.02, .72, .025, .03, .13, .01);
    rbox(plastic, black, s * .71, .41, .69, .2, .04, .3, .012);
    for (const z of [.6, .78]) box(plastic, black, s * .7, .45, z, .03, .06, .03);
    box(paint, trim, s * (W + .001), .955, 1.2, .002, .05, 1.42);
    // Truck mirror on two arms from the door frame and A-pillar.
    rod(plastic, black, [s * .79, 1.2, 1.79], [s * .97, 1.31, 1.84], .012);
    rod(plastic, black, [s * .785, 1.62, 1.64], [s * .97, 1.53, 1.83], .012);
    rbox(plastic, black, s * .99, 1.42, 1.84, .05, .27, .15, .02);
    box(plastic, "#a7b1b5", s * .99, 1.42, 1.763, .036, .24, .004);
    rbox(lens, "#f29a1f", s * (W + .006), .86, 1.8, .012, .04, .07, .006);
    // Wheelhouse liner and its inner wall close the arch.
    part(plastic, new T.CylinderGeometry(.362, .362, .27, 16, 1, true, .302, 2.332).rotateZ(Math.PI / 2), "#191a1b", s * .655, .29, front);
    part(plastic, new T.CylinderGeometry(.37, .37, .012, 16, 1, false, .302, 2.332).rotateZ(Math.PI / 2), "#191a1b", s * .52, .29, front);
    // Twin-beam headlamp on a silvered reflector, wrap-round amber indicator.
    rbox(plastic, "#a9afb0", s * .53, .89, 2.083, .25, .125, .006, .004);
    for (const x of [.47, .59]) {
      part(plastic, new T.CylinderGeometry(.047, .047, .008, 16).rotateX(Math.PI / 2), "#c9cecf", s * x, .89, 2.087);
      part(lens, new T.CylinderGeometry(.036, .036, .008, 16).rotateX(Math.PI / 2), "#eef0ea", s * x, .89, 2.09);
    }
    rbox(lens, "#f29a1f", s * .772, .89, 2.042, .07, .12, .016, .005, 0, s * Math.PI / 4);
    if (roofLamps) rbox(lens, "#f5a623", s * .52, 1.97, 1.3, .09, .028, .045, .01);
    // Interior seen through the glass: sun visors, seat backs and headrests.
    rbox(plastic, "#8f8c84", s * .38, 1.7, 1.5, .42, .16, .02, .01, -rake);
    const seat = s < 0 ? -.38 : .32;
    rbox(plastic, "#3c3e41", seat, 1.38, .74, .44, .52, .11, .05, -.2);
    rbox(plastic, "#3c3e41", seat, 1.7, .685, .26, .14, .09, .04, -.2);
  }
  // Black fascia band carrying lamps and grille slats; bumper with intake, plate and tow eye; wipers on the cowl.
  rbox(plastic, black, 0, .885, 2.075, 1.32, .17, .014, .006);
  for (const y of [.84, .885, .93]) box(paint, trim, 0, y, 2.085, .66, .018, .01);
  shell(plastic, "#242627", profile([[1.98, .3, .03, .01], [2.16, .31, .1, .06], [2.165, .57, .1, .06], [1.98, .58, .03, .01]]), .81);
  box(plastic, "#0f1011", 0, .53, 2.166, .72, .045, .004);
  for (const s of [-1, 1]) {
    part(plastic, new T.CylinderGeometry(.042, .042, .01, 14).rotateX(Math.PI / 2), "#121314", s * .62, .45, 2.166);
    part(plastic, new T.CylinderGeometry(.03, .03, .01, 14).rotateX(Math.PI / 2), "#d3d7d4", s * .62, .45, 2.169);
  }
  plate(plastic, .44, 2.168, [[2, 2, 1, 4]], 1);
  rbox(plastic, "#2a2b2c", -.36, .29, 2.1, .05, .06, .1, .01);
  part(plastic, new T.TorusGeometry(.028, .009, 6, 12), "#3a3c3d", -.36, .26, 2.156);
  box(plastic, black, 0, 1.14, 1.89, 1.4, .014, .06);
  for (const x of [-.27, .3]) {
    box(plastic, "#141516", x, 1.199, 1.864, .52, .014, .012, -rake);
    rbox(plastic, black, x - .25, 1.17, 1.88, .03, .02, .03, .008);
  }
  // Dashboard, binnacle, raked steering wheel and column on the right; headliner and floor trim.
  rbox(plastic, "#2b2c2d", 0, 1.205, 1.66, 1.52, .13, .3, .04);
  rbox(plastic, "#232425", -.4, 1.29, 1.57, .34, .07, .14, .03);
  part(plastic, new T.TorusGeometry(.19, .016, 6, 20), "#1e1f20", -.4, 1.36, 1.32, 1, 1, 1, .87);
  rod(plastic, "#1e1f20", [-.4, 1.36, 1.32], [-.4, 1.13, 1.51], .025);
  box(plastic, "#3b3c3b", 0, 1.143, 1.06, 1.5, .006, .92);
  box(plastic, "#454645", 0, 1.47, .603, 1.5, .64, .004);
  box(plastic, "#a9a69c", 0, 1.792, 1.07, 1.5, .006, .94);
  buckets.forEach((b, i) => b.slice(start[i]).forEach(tumblehome));
}

/** Ladder frame, leaf-sprung rear axle, tank, spare, guards, rear lamps, plate and under-run bar. */
function chassis(steelwork: Parts, plastic: Parts, lens: Parts, tail: number, spare: T.BufferGeometry) {
  const railStart = tail + .02, railMid = (railStart + 1.95) / 2;
  for (const s of [-1, 1]) {
    box(steelwork, steel, s * .42, .48, railMid, .06, .16, 1.95 - railStart);
    // Semi-elliptic leaf pack under each rail, hung from shackles at both eyes.
    const leaves: Corner[] = [];
    for (let i = 0; i <= 8; i++) { const u = i / 4 - 1; leaves.push([rear + u * .56, .32 + .055 * u * u]); }
    for (let i = 8; i >= 0; i--) { const u = i / 4 - 1; leaves.push([rear + u * .56, .32 + .055 * u * u - .05 + .032 * u * u]); }
    slab(steelwork, "#2e3132", leaves, s * .39, s * .45);
    for (const u of [-1, 1]) {
      rod(steelwork, steel, [s * .385, .375, rear + u * .56], [s * .455, .375, rear + u * .56], .018);
      box(steelwork, steel, s * .42, .395, rear + u * .56, .05, .05, .04);
    }
    // Rear mudguard over each tyre and a hanging rubber flap behind each axle.
    box(plastic, "#191a1b", s * .69, .335, .87, .2, .27, .01);
    part(plastic, new T.CylinderGeometry(.33, .33, .22, 14, 1, true, .35, 2.6).rotateZ(Math.PI / 2), black, s * track, R, rear);
    box(plastic, "#191a1b", s * track, .385, rear - .4, .24, .47, .01);
    // Rear lamp cluster: red tail and brake, amber indicator, and a reverse lamp that stays dark when parked.
    rbox(plastic, "#1e1f20", s * .6, .56, tail + .02, .3, .11, .05, .012);
    box(lens, "#c81d1d", s * .69, .56, tail - .007, .11, .085, .004);
    box(lens, "#f29a1f", s * .585, .56, tail - .007, .085, .085, .004);
    box(plastic, "#e4e2da", s * .495, .56, tail - .007, .07, .085, .004);
    box(steelwork, steel, s * .42, .47, tail - .02, .05, .09, .1);
  }
  for (const z of [railStart + .03, -.55, .35]) box(steelwork, steel, 0, .48, z, .78, .1, .06);
  rod(steelwork, steel, [-.62, R, rear], [.62, R, rear], .04);
  part(steelwork, new T.SphereGeometry(.5, 12, 8), "#2e3132", 0, R, rear + .04, .22, .2, .24);
  // Silencer and tailpipe on the offside, turned down ahead of the rear wheel.
  rbox(steelwork, "#3d3c39", -.56, .4, -.3, .14, .13, .42, .05);
  rod(steelwork, "#3d3c39", [-.56, .4, -.5], [-.63, .33, -.8], .022);
  // Fuel tank on the kerb side, spare wheel slung flat between the rails behind the axle.
  rbox(steelwork, "#3a3e3f", .56, .45, -.35, .24, .22, .52, .05);
  for (const z of [-.5, -.2]) box(steelwork, steel, .56, .45, z, .25, .23, .025);
  rod(steelwork, steel, [.6, .53, -.17], [.65, .6, -.17], .022);
  rbox(steelwork, "#4a4e4f", .655, .61, -.17, .05, .02, .05, .008);
  plastic.push(spare.rotateZ(Math.PI / 2).translate(0, .38, -1.56));
  for (const z of [-1.71, -1.41]) {
    box(steelwork, steel, 0, .29, z, .62, .02, .04);
    for (const s of [-1, 1]) box(steelwork, steel, s * .3, .35, z, .02, .12, .03);
  }
  // Rear under-run bar with red and white conspicuity tape.
  const bar = tail - .07;
  rbox(steelwork, "#2b2e30", 0, .42, bar, 1.4, .09, .06, .015);
  for (let i = 0; i < 7; i++) box(steelwork, i % 2 ? white : red, -.6 + i * .2, .42, bar - .031, .19, .05, .002);
  plate(plastic, .57, tail - .012, [[2, 2], [1, 4]], -1);
}

/** Drop-side deck: hinged steel sides, headboard with cab guard, and the tailgate closeCargo raises. */
function dropSides(group: T.Group, steelwork: Parts, finish: T.Material, trim: string) {
  const guard = "#3a4345";
  for (const s of [-1, 1]) {
    box(steelwork, trim, s * .805, .913, -.75, .03, .385, 2.16);
    for (const y of [.83, .99]) box(steelwork, trim, s * .8235, y, -.75, .007, .035, 2.08);
    rod(steelwork, trim, [s * .805, 1.106, -1.83], [s * .805, 1.106, .33], .02);
    for (const z of [-1.855, .355]) rbox(steelwork, trim, s * .8, .88, z, .05, .48, .05, .008);
    for (const z of [-1.4, -.75, -.1]) rod(steelwork, steel, [s * .823, .722, z - .04], [s * .823, .722, z + .04], .014);
    for (const z of [-1.79, .29]) rbox(steelwork, black, s * .83, 1.05, z, .02, .05, .06, .008);
    for (let i = 0; i < 11; i++) box(steelwork, i % 2 ? white : red, s * .8212, .765, -1.73 + i * .19, .0015, .045, .18);
    // Rope hooks under the sole bar.
    for (const z of [-1.6, -1, -.4, .2]) {
      rbox(steelwork, steel, s * .83, .612, z, .02, .045, .03, .006);
      box(steelwork, steel, s * .845, .592, z, .03, .014, .03);
    }
    box(steelwork, guard, s * .74, 1.45, .37, .04, .7, .04);
  }
  box(steelwork, trim, 0, .913, .37, 1.55, .385, .03);
  for (const y of [1.45, 1.8]) box(steelwork, guard, 0, y, .37, 1.52, .04, .04);
  for (const x of [-.37, 0, .37]) box(steelwork, guard, x, 1.45, .37, .025, .7, .025);
  // Tailgate drawn lowered; local -y is its outer face once raised.
  const gate = new T.Group(), leaf: Parts = [];
  gate.position.set(0, .72, -1.88);
  box(leaf, trim, 0, 0, -.192, 1.54, .03, .384);
  for (const z of [-.11, -.27]) box(leaf, trim, 0, -.0185, z, 1.48, .007, .035);
  rod(leaf, trim, [-.77, 0, -.384], [.77, 0, -.384], .02);
  for (const s of [-1, 1]) {
    rbox(leaf, black, s * .7, -.025, -.33, .06, .02, .05, .008);
    rod(leaf, steel, [s * .45 - .04, 0, 0], [s * .45 + .04, 0, 0], .014);
  }
  for (let i = 0; i < 8; i++) box(leaf, i % 2 ? white : red, -.665 + i * .19, -.0158, -.05, .18, .0015, .045);
  assemble(gate, leaf, finish);
  group.add(gate);
  return (fraction: number) => { gate.rotation.x = Math.PI * .5 * fraction; };
}

/** Insulated box: kerbside roller shutter under a hood, rear barn doors that fold back flat against the sides. */
function boxBody(group: T.Group, steelwork: Parts, lens: Parts, finish: T.Material) {
  const skin = "#ebe9e2", liner = "#8f8b82";
  box(steelwork, skin, 0, 1.53, .395, 1.64, 1.7, .03);
  box(steelwork, skin, 0, 2.36, -.795, 1.64, .04, 2.35);
  box(steelwork, skin, -.8025, 1.53, -.795, .035, 1.7, 2.35);
  slab(steelwork, skin, [[-1.97, .68], [.38, .68], [.38, 2.38], [-1.97, 2.38]], .785, .82, [[[-1.08, .8], [.22, .8], [.22, 2.22], [-1.08, 2.22]]]);
  // Darker lining inside, so the open body reads as shaded.
  box(steelwork, liner, -.783, 1.53, -.795, .004, 1.66, 2.33);
  box(steelwork, liner, 0, 1.53, .378, 1.56, 1.66, .004);
  box(steelwork, liner, 0, 2.338, -.795, 1.56, .004, 2.33);
  box(steelwork, liner, .783, 1.53, .3, .004, 1.66, .156);
  box(steelwork, liner, .783, 1.53, -1.525, .004, 1.66, .89);
  box(steelwork, liner, .783, 2.28, -.43, .004, .12, 1.3);
  box(steelwork, liner, .783, .758, -.43, .004, .084, 1.3);
  // Aluminium corner posts, cant rails, bottom rails with tape, marker lamps.
  for (const s of [-1, 1]) {
    rbox(steelwork, alloy, s * .815, 1.53, .4, .05, 1.72, .05, .015);
    rbox(steelwork, alloy, s * .8, 1.53, -1.975, .07, 1.72, .05, .015);
    rbox(steelwork, alloy, s * .815, 2.36, -.795, .05, .05, 2.43, .015);
    box(steelwork, alloy, s * .825, .715, -.795, .03, .08, 2.43);
    for (let i = 0; i < 12; i++) box(steelwork, i % 2 ? white : red, s * .8408, .715, -1.9 + i * .2, .0015, .045, .19);
    for (const z of [.1, -.85]) rbox(lens, "#f5a623", s * .845, .715, z, .012, .03, .06, .005);
    rbox(lens, "#f5a623", s * .7, 2.33, .425, .1, .04, .02, .008);
    rbox(lens, "#c81d1d", s * .62, 2.355, -2.007, .1, .035, .015, .006);
    for (const y of [.95, 1.55, 2.15]) box(steelwork, alloy, s * .86, y, -2.005, .05, .06, .025);
  }
  for (const z of [.4, -1.975]) rbox(steelwork, alloy, 0, 2.36, z, 1.68, .05, .05, .015);
  box(steelwork, alloy, 0, .735, -1.975, 1.6, .04, .05);
  // Shutter guides, sill and the hood the rolled curtain hides in.
  for (const z of [.235, -1.095]) box(steelwork, alloy, .826, 1.51, z, .022, 1.42, .03);
  box(steelwork, alloy, .81, .79, -.43, .04, .02, 1.34);
  rbox(steelwork, alloy, .845, 2.27, -.43, .05, .14, 1.36, .015);
  const shutter = new T.Group(), slats: Parts = [];
  shutter.position.set(.8, 2.32, -.43);
  for (let i = 0; i < 17; i++) box(slats, i % 2 ? "#d3d7d6" : "#c9cdcc", 0, -.142 - i * .0835, 0, .022, .079, 1.3);
  box(slats, alloy, 0, -1.5, 0, .03, .04, 1.3);
  rbox(slats, black, .02, -1.47, 0, .02, .03, .16, .008);
  assemble(shutter, slats, finish);
  group.add(shutter);
  // Barn doors on cranked hinges outboard of the corners clear the lock gear when folded back.
  const doors = [-1, 1].map(s => {
    const door = new T.Group(), leaf: Parts = [], o = -s; // o: local x of the face that is outside when closed
    door.position.set(s * .885, 0, -2.022);
    box(leaf, skin, 0, 1.545, .475, .04, 1.57, .82);
    box(leaf, black, 0, 1.545, .882, .036, 1.55, .008);
    for (const z of [.3, .66]) {
      rod(leaf, alloy, [o * .04, .8, z], [o * .04, 2.29, z], .011);
      for (const y of [.86, 1.55, 2.24]) box(leaf, alloy, o * .03, y, z, .022, .05, .05);
      rbox(leaf, black, o * .052, 1.36, z + .055, .02, .035, .14, .008);
    }
    for (const y of [.95, 1.55, 2.15]) {
      box(leaf, alloy, o * .024, y, .06, .008, .05, .14);
      rod(leaf, alloy, [0, y - .035, 0], [0, y + .035, 0], .013);
    }
    for (const y of [.86, 2.27]) for (let i = 0; i < 5; i++) box(leaf, i % 2 ? white : red, o * .0208, y, .15 + i * .16, .0015, .05, .15);
    assemble(door, leaf, finish);
    group.add(door);
    return door;
  });
  return (fraction: number) => {
    shutter.scale.y = .07 + .93 * fraction;
    doors.forEach((door, i) => { door.rotation.y = (i ? 1 : -1) * Math.PI * 1.5 * fraction; });
  };
}

export type DeliveryBody = "flatbed" | "box truck";

export function deliveryPickup(parent: T.Group, shadowMaterial: T.Material, body: DeliveryBody) {
  const group = new T.Group(), flatbed = body === "flatbed";
  group.name = flatbed ? "Teal flatbed delivery truck" : "Ochre box delivery truck";
  parent.add(group);
  const paint: Parts = [], steelwork: Parts = [], glass: Parts = [], plastic: Parts = [], lens: Parts = [];
  const trim = flatbed ? "#337b78" : "#88492f", tail = flatbed ? -1.88 : -2, head = flatbed ? .385 : .41;
  const tyre = wheelGeometry(28);
  cab(paint, glass, plastic, lens, flatbed ? "#e6dbc3" : "#e2aa59", trim, flatbed);
  chassis(steelwork, plastic, lens, tail, wheelGeometry(12));
  // Load floor on cross bearers, carried by sole bars on the chassis rails.
  const mid = (tail + head) / 2, length = head - tail;
  box(steelwork, "#5c6462", 0, .696, mid, 1.6, .04, length);
  for (const s of [-1, 1]) {
    box(steelwork, flatbed ? trim : steel, s * .8, .667, mid, .04, .094, length);
    box(steelwork, steel, s * .42, .59, mid, .07, .06, length);
  }
  for (let z = tail + .1; z < head; z += .42) box(steelwork, steel, 0, .645, z, 1.56, .05, .05);
  const finish = vehicleFinish("paint", { metalness: .12, roughness: .5, clearcoat: .25, clearcoatRoughness: .45 });
  const closeCargo = flatbed ? dropSides(group, steelwork, finish, trim) : boxBody(group, steelwork, lens, finish);
  assemble(group, paint, vehicleFinish("paint", { metalness: .05, roughness: .36 }));
  assemble(group, steelwork, finish);
  assemble(group, glass, vehicleFinish("glass", { transparent: true, opacity: .62, depthWrite: false }));
  assemble(group, plastic, vehicleFinish("plastic"));
  lamps(group, lens);
  // One soft contact shadow under the body and a darker patch under each tyre.
  const patches = [[0, -.05, 2.3, 4.9], ...[-1, 1].flatMap(s => [front, rear].map(z => [s * track, z, .34, .52]))];
  group.add(new T.Mesh(mergeGeometries(patches.map(([x, z, w, l]) =>
    new T.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(x, w < 1 ? .012 : .011, z))), shadowMaterial));
  const wheelFinish = vehicleFinish("rubber", { roughness: .62, metalness: .3, envMapIntensity: .5 });
  const wheels = [-1, 1].flatMap(s => [front, rear].map(z => {
    const w = new T.Mesh(tyre, wheelFinish);
    w.position.set(s * track, R, z); w.rotation.y = s < 0 ? Math.PI : 0; w.receiveShadow = true;
    group.add(w);
    return w;
  }));
  castSunShadow(group);
  return { group, closeCargo, wheels };
}

export function stockContainer(body:DeliveryBody) {
  const carton = new T.Group(), parts: T.BufferGeometry[] = [];
  if (body==="flatbed") {
    box(parts,"#a17b55",0,-.138,0,.44,.026,.33);
    for (const x of [-.20,.20]) for (const z of [-.141,.141]) {
      box(parts,"#846851",x,0,z,.035,.30,.033);
    }
    for (const side of [-1,1]) for (let i=0;i<3;i++) {
      const y=-.108+i*.103, wood=i%2 ? "#bd9569" : "#c9a87c";
      box(parts,wood,0,y,side*.159,.44,.068,.018);
      box(parts,wood,side*.212,y,0,.018,.068,.31);
    }
    // Wrapped studio ceramics and a paper packing bed visible through the slats.
    box(parts,"#b3a28a",0,-.072,0,.37,.09,.25);
    for (const x of [-.105,.085]) {
      oval(parts,x<0?"#b77753":"#658b84",x,.013,0,.17,.212,.173);
      part(parts,new T.CylinderGeometry(.046,.043,.056,12),"#d5bc94",x,.115,0);
      part(parts,new T.CylinderGeometry(.029,.029,.002,12),"#665749",x,.144,0);
    }
  } else {
    box(parts,"#bc925f",0,0,0,.44,.30,.33);
    box(parts,"#dabb83",0,.151,0,.075,.006,.333);
    for(const side of [-1,1]) {
      box(parts,"#dabb83",0,.04,side*.166,.075,.225,.005);
      box(parts,"#f0dbb6",-.117,.025,side*.168,.103,.067,.005);
      for(let i=0;i<7;i++) box(parts,"#635950",-.15+i*.011,.028,side*.171,.003+i%2*.002,.038,.002);
    }
  }
  assemble(carton,parts,{roughness:.91});
  return carton;
}
