import * as T from "three";

// Coordinates in the entrance frame, with the visitor facing down the road towards -Z.
const rightStations = [2.8, 8.05, 13.3, 18.55];
export const entrancePalmTrunks = [
  ...rightStations.map(z => ({ x: 7.25, z, radius: 0.28 })),
  ...[2.52, 7.78, 13.25, 18.79].map(z => ({ x: -7.25, z, radius: 0.28 })),
] as const;

class Surface {
  coordinates: number[] = [];
  colours: number[] = [];
  triangles: number[] = [];

  vertex(p: T.Vector3, tint: T.Color, tone = 1) {
    const index = this.coordinates.length / 3;
    this.coordinates.push(p.x, p.y, p.z);
    this.colours.push(tint.r * tone, tint.g * tone, tint.b * tone);
    return index;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.triangles.push(a, b, d, b, c, d);
  }
  mesh(name: string, side: T.Side) {
    const shape = new T.BufferGeometry();
    shape.setIndex(this.triangles);
    shape.setAttribute("position", new T.Float32BufferAttribute(this.coordinates, 3));
    shape.setAttribute("color", new T.Float32BufferAttribute(this.colours, 3));
    shape.computeVertexNormals();
    shape.computeBoundingSphere();
    const mesh = new T.Mesh(shape, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side }));
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

const bark = new T.Color("#a18d74"), scar = new T.Color("#91816a");
const crownShaft = new T.Color("#929568"), sheath = new T.Color("#858160");
const leafColours = ["#627543", "#4c693f", "#74864e", "#536f49", "#809156"].map(c => new T.Color(c));
const rib = new T.Color("#919155");
const tau = Math.PI * 2;

function addTrunk(surface: Surface, foot: T.Vector3, height: number, bend: T.Vector3, seed: number) {
  const sides = 12, rings = Math.round(height / 0.27);
  let previous = -1;
  function ring(t: number, radius: number, tint: T.Color, brightness = 1) {
    const base = surface.coordinates.length / 3;
    for (let j = 0; j < sides; j++) {
      const angle = tau * j / sides;
      const shoulder = Math.sin(Math.PI * t) * 0.062;
      const r = radius * (1 + 0.035 * Math.cos(3 * angle + seed));
      const jointLift = 0.014 * Math.sin(2 * angle + t * 5 + seed) * Math.sin(Math.PI * t);
      const point = new T.Vector3(foot.x + bend.x * t * t + shoulder + r * Math.cos(angle),
        foot.y + height * t + jointLift, foot.z + bend.z * t * t + r * Math.sin(angle));
      surface.vertex(point, tint, brightness * (0.94 + 0.065 * Math.sin(5 * angle + seed + t * 13)));
      if (previous >= 0) {
        const k = (j + 1) % sides;
        surface.quad(previous + j, base + j, base + k, previous + k);
      }
    }
    previous = base;
  }
  for (let k = 0; k < rings; k++) {
    const t = k / rings;
    const r = 0.139 - t * 0.040 + 0.067 * Math.exp(-22 * t);
    const neck = t > 0.86;
    ring(t, r, neck ? sheath : scar, 0.91);
    ring(t + 0.09 / rings, r + 0.008, neck ? crownShaft : bark, 1.08);
    ring(t + 0.88 / rings, r - 0.003, neck ? crownShaft : bark, 0.91 + 0.10 * Math.sin(seed + k * 5.1));
  }
  ring(1, 0.095, sheath);
  return foot.clone().add(bend).add(new T.Vector3(0, height, 0));
}

/** Arching rachis and two alternating rows of folded, tapering leaflets form each pinnate frond. */
function addFrond(surface: Surface, crown: T.Vector3, heading: number, age: number, seed: number) {
  const forward = new T.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const across = new T.Vector3(-forward.z, 0, forward.x);
  const spread = 0.71 + 1.43 * age + 0.15 * Math.sin(3.7 * seed);
  const end = 1.38 - 2.62 * age + 0.12 * Math.cos(seed);
  const arch = 0.39 + age * 0.62 + 0.11 * Math.sin(seed * 1.8);
  const base = crown.clone();
  base.y += 0.14 - age * 0.20;
  function stem(t: number) {
    const p = base.clone().addScaledVector(forward, t * spread)
      .addScaledVector(across, (0.11 + 0.08 * Math.sin(seed)) * Math.sin(t * 2.4));
    p.y += t * end + 4 * arch * t * (1 - t);
    return p;
  }

  // A slim triangular section keeps the spine visible along the edge of the canopy.
  for (let s = 0; s <= 8; s++) {
    const t = s / 8, r = 0.024 * (1 - t) + 0.002;
    const p = stem(t);
    const a = surface.vertex(p.clone().addScaledVector(across, r), rib, 0.83);
    surface.vertex(p.clone().addScaledVector(across, -r), rib, 0.83);
    p.y += r * 0.92;
    surface.vertex(p, rib, 1.05);
    if (s) for (let k = 0; k < 3; k++) surface.quad(a - 3 + k, a + k, a + (k + 1) % 3, a - 3 + (k + 1) % 3);
  }

  const pairs = Math.round(12 + age * 6);
  for (let i = 0; i < pairs; i++) {
    for (const side of [-1, 1]) {
      const t = 0.12 + (i + (side + 1) * 0.12) * 0.85 / pairs;
      const p = stem(t), size = 0.62 + 0.38 * age;
      const blade = size * (0.07 + 0.54 * Math.pow(Math.sin(Math.PI * t), 0.69)) * (1.12 - 0.31 * t);
      const middle = p.clone().addScaledVector(across, side * blade * 0.59)
        .addScaledVector(forward, blade * (0.12 + t * 0.15));
      const tip = p.clone().addScaledVector(across, side * blade)
        .addScaledVector(forward, blade * (0.45 + t * 0.81));
      middle.y += blade * (0.20 - age * 0.23 + 0.05 * Math.sin(i * 3 + seed));
      tip.y -= blade * (0.53 + age * 0.51 + 0.21 * Math.sin(i * 2.23 + seed));
      const width = 0.010 + blade * 0.082;
      const green = leafColours[(seed + i % 3) % leafColours.length];
      const a = surface.vertex(p, green, 0.84);
      const b = surface.vertex(middle.clone().addScaledVector(forward, -side * width), green, 0.91);
      const d = surface.vertex(middle.clone().addScaledVector(forward, side * width), green, 1.04);
      middle.y += width * 0.67;
      const c = surface.vertex(middle, green, 1.18);
      const e = surface.vertex(tip, green, 0.87);
      // Both halves have an upward-facing surface, with the midrib lifted between them.
      surface.triangles.push(a, b, c, a, c, d, b, e, c, c, e, d);
    }
  }
}

/** Eight individually shaped palms share one mesh for their trunks and one for their crowns. */
export function addEntrancePalms(parent: T.Group) {
  const trunks = new Surface(), leaves = new Surface();
  for (const [i, { x, z }] of entrancePalmTrunks.entries()) {
    const seed = i * 13 + 3;
    const height = 4.63 + 0.77 * (0.5 + 0.5 * Math.sin(seed * 1.54));
    const bend = new T.Vector3(0.27 * Math.cos(seed), 0, 0.34 * Math.sin(seed));
    const crown = addTrunk(trunks, new T.Vector3(x, -0.065, z), height, bend, seed);
    const fronds = 15;
    for (let j = 0; j < fronds; j++) {
      const age = j / (fronds - 1);
      addFrond(leaves, crown, i * 1.87 + j * 2.39996, age, seed + j * 11);
    }
  }
  parent.add(trunks.mesh("Entrance palm trunks", T.FrontSide), leaves.mesh("Entrance palm crowns", T.DoubleSide));
}
