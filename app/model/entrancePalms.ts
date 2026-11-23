import * as T from "three";
import { PlantSurface } from "./foliage";
import { fountainGaps } from "./entranceLayout";

// Coordinates in the entrance frame, with the visitor facing down the road towards -Z.
const rightStations = [fountainGaps[0], fountainGaps[1], fountainGaps[4], fountainGaps[5]];
export const entrancePalmTrunks = [
  ...rightStations.map(z => ({ x: 7.25, z, radius: 0.28 })),
  ...[2.52, 7.78, 13.25, 18.79].map(z => ({ x: -7.25, z, radius: 0.28 })),
] as const;

const bark = new T.Color("#a08a70"), scar = new T.Color("#74604c");
const crownShaft = new T.Color("#878958"), sheath = new T.Color("#776b4a");
const leafColours = ["#3d593d", "#4d6c45", "#56764c", "#74925b", "#63814f"].map(c => new T.Color(c));
const matureLeaf = new T.Color("#807d4c"), newLeaf = new T.Color("#849950");
const rib = new T.Color("#8d9256");
const tau = Math.PI * 2;
const crownFlex = .27;

function addTrunk(surface: PlantSurface, foot: T.Vector3, height: number, bend: T.Vector3, seed: number) {
  const sides = 14, rings = Math.round(height / .22);
  let previous = -1;
  function ring(t: number, radius: number, tint: T.Color, brightness: number, ridge: number) {
    const base = surface.coordinates.length / 3;
    for (let j = 0; j < sides; j++) {
      const angle = tau * j / sides + seed * .075;
      const scarPattern = Math.cos(Math.PI * j + t * rings * Math.PI);
      const r = radius * (1 + .057 * Math.cos(3 * angle + seed)) + ridge * (.52 + .48 * scarPattern);
      const lift = .028 * scarPattern * Math.sin(Math.PI * t) + .012 * Math.sin(2 * angle + seed);
      const point = new T.Vector3(foot.x + bend.x * t * t + .067 * Math.sin(Math.PI * t) + r * Math.cos(angle),
        foot.y + height * t + lift, foot.z + bend.z * t * t + r * Math.sin(angle));
      surface.vertex(point, tint, brightness * (.94 + .10 * Math.sin(5 * angle + seed + t * 13)), crownFlex * t ** 3);
      if (previous >= 0) {
        const k = (j + 1) % sides;
        surface.quad(previous + j, base + j, base + k, previous + k);
      }
    }
    previous = base;
  }
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const r = .151 - t * .052 + .079 * Math.exp(-16 * t) + .025 * Math.exp(-((t - .9) ** 2) / .003);
    const neck = t > .84;
    ring(t, r - .006, neck ? sheath : scar, .89, 0);
    ring(t + .20 / rings, r, neck ? crownShaft : bark, 1.08, neck ? .019 : .015);
    ring(t + .77 / rings, r - .002, neck ? sheath : bark, .93 + .12 * Math.sin(seed + k * 5.1), .003);
  }
  ring(1, .092, sheath, .95, 0);
  return foot.clone().add(bend).add(new T.Vector3(0, height, 0));
}

/** Arching rachis and two alternating rows of folded, tapering leaflets form each pinnate frond. */
function addFrond(surface: PlantSurface, crown: T.Vector3, heading: number, age: number, scale: number, seed: number) {
  const forward = new T.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const across = new T.Vector3(-forward.z, 0, forward.x);
  const spread = scale * (.63 + 1.64 * age + .22 * Math.sin(3.7 * seed));
  const end = scale * (1.37 - 2.62 * age + .16 * Math.cos(seed));
  const arch = scale * (.29 + age * .60 + .15 * Math.sin(seed * 1.8));
  const base = crown.clone().addScaledVector(forward, .044 + .034 * age);
  base.y += .09 - age * .27;
  function stem(t: number) {
    const p = base.clone().addScaledVector(forward, t * spread)
      .addScaledVector(across, (.06 + .19 * Math.sin(seed)) * Math.sin(t * 2.4));
    p.y += t * end + arch * Math.sin(Math.PI * t);
    return p;
  }
  const flex = (t: number) => crownFlex + (.68 + .16 * age) * t ** 1.7;

  // The petiole emerges from the old leaf bases and tapers into a thin spine.
  for (let s = 0; s <= 10; s++) {
    const t = s / 10, r = .030 * (1 - t) ** 1.7 + .002;
    const p = stem(t);
    const color = s < 2 ? sheath : rib;
    const a = surface.vertex(p.clone().addScaledVector(across, r), color, .80, flex(t));
    surface.vertex(p.clone().addScaledVector(across, -r), color, .92, flex(t));
    p.y += r * 1.1;
    surface.vertex(p, color, 1.06, flex(t));
    if (s) for (let k = 0; k < 3; k++) surface.quad(a - 3 + k, a + k, a + (k + 1) % 3, a - 3 + (k + 1) % 3);
  }

  const pairs = Math.round(13 + age * 7);
  for (let i = 0; i < pairs; i++) {
    for (const side of [-1, 1]) {
      const phase = seed * 1.8 + i * 1.63 + side * .91;
      const t = .14 + (i + (side + 1) * .17 + .14 * Math.sin(phase)) * .85 / pairs;
      const root = stem(t);
      const blade = scale * (.65 + .35 * age) * (.05 + .58 * Math.sin(Math.PI * t) ** .75)
        * (1.08 - .29 * t + .13 * Math.cos(phase));
      const control = root.clone().addScaledVector(across, side * blade * .77)
        .addScaledVector(forward, blade * (.17 + t * .24));
      const tip = root.clone().addScaledVector(across, side * blade)
        .addScaledVector(forward, blade * (.42 + t * .73));
      control.y += blade * (.46 - age * .40 + .12 * Math.sin(phase));
      tip.y -= blade * (.32 + age * .75 + .20 * Math.sin(phase));
      const widthAxis = forward.clone().addScaledVector(across, -side * (.29 + t * .49));
      widthAxis.y = .45 * Math.sin(phase * 1.7);
      widthAxis.normalize();
      const green = age > .88 && i > pairs * .56 ? matureLeaf :
        age < .14 ? newLeaf : leafColours[(seed + i + side + 1) % leafColours.length];
      const rootFlex = flex(t);
      surface.leaf(root, control, tip, widthAxis, .0055 + blade * .081, green, {
        rootFlex, tipFlex: rootFlex + blade * .53, flutter: blade * 1.4, phase,
      });
    }
  }
}

/** Eight individually shaped palms share one mesh for their trunks and one for their crowns. */
export function addEntrancePalms(parent: T.Group, wind: T.IUniform<number>) {
  const trunks = new PlantSurface(), leaves = new PlantSurface();
  for (const [i, { x, z }] of entrancePalmTrunks.entries()) {
    const seed = i * 13 + 3;
    const height = 4.55 + .80 * (.5 + .5 * Math.sin(seed * 1.54));
    const bend = new T.Vector3(.35 * Math.cos(seed), 0, .41 * Math.sin(seed));
    const crown = addTrunk(trunks, new T.Vector3(x, -0.065, z), height, bend, seed);
    const fronds = 18 + i % 4;
    const size = .98 + .11 * Math.cos(seed);
    for (let j = 0; j < fronds; j++) {
      const age = T.MathUtils.clamp((j + .48 * Math.sin(j * 18 + seed)) / (fronds - 1), 0, 1);
      const yaw = i * 1.87 + j * 2.39996 + .24 * Math.cos(seed + j * 7.6);
      addFrond(leaves, crown, yaw, age, size, seed + j * 11);
    }
  }
  parent.add(trunks.mesh("Entrance palm trunks", T.FrontSide, wind, true),
    leaves.mesh("Entrance palm crowns", T.DoubleSide, wind));
}
