import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { sheetPoint, type Floor, type Unit } from "./geometry";
import { eastFacadeAt, entranceLength, entranceOrigin, entrancePoint, entranceSign, entranceYaw, fountainWallFace as face } from "./entranceLayout";
import { entranceFountainFootprints } from "./entranceFountain";
import { entrancePalmTrunks } from "./entrancePalms";
import { doorStation, glassSetback, retailBays } from "./retailFrontages";
import { shellBoundaries, wingBoundaries } from "./wings";

/**
 * Anything that changes after dark keeps `userData.night = (on: boolean) => void`.
 * The viewer calls it on every object in the scene whenever the view switches.
 */
export function applyNight(root: T.Object3D, on: boolean) {
  root.traverse(object => (object.userData.night as ((on: boolean) => void) | undefined)?.(on));
}

/**
 * Renders the scene with multisampling, then passes on a copy with every non-finite value removed.
 * A single NaN from any material would otherwise be blurred across the whole frame by the bloom.
 */
export class ScenePass extends Pass {
  private target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4, stencilBuffer: true });
  private copy = new FullScreenQuad(new T.ShaderMaterial({
    uniforms: { frame: { value: this.target.texture } },
    vertexShader: "varying vec2 at; void main() { at = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D frame; varying vec2 at;
      void main() {
        vec3 colour = texture2D(frame, at).rgb;
        if (any(isnan(colour)) || any(isinf(colour))) colour = vec3(0.0);
        gl_FragColor = vec4(clamp(colour, 0.0, 8.0), 1.0);
      }`,
  }));
  constructor(private scene: T.Scene, private camera: T.Camera) { super(); }
  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(writeBuffer);
    this.copy.render(renderer);
  }
  setSize(width: number, height: number) { this.target.setSize(width, height); }
  dispose() {
    this.target.dispose();
    this.copy.material.dispose();
    this.copy.dispose();
  }
}

function merged(parts: T.BufferGeometry[]) {
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}

const warmWhite = "#ffdcb0";

/** Soft light drawn as additive geometry. Vertex colours carry the brightness and fade to black at the edges. */
class Glow {
  private position: number[] = [];
  private colour: number[] = [];
  private tint = new T.Color();
  /** Corners in order around the quad, each with its own brightness. */
  quad(corners: T.Vector3[], colour: string, levels: number[]) {
    this.tint.set(colour);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.position.push(corners[i].x, corners[i].y, corners[i].z);
      this.colour.push(this.tint.r * levels[i], this.tint.g * levels[i], this.tint.b * levels[i]);
    }
  }
  disc(centre: T.Vector3, radius: number, colour: string, level: number) {
    const rim = Array.from({ length: 17 }, (_, i) => new T.Vector3(
      centre.x + radius * Math.cos(i * Math.PI / 8), centre.y, centre.z + radius * Math.sin(i * Math.PI / 8)));
    for (let i = 0; i < 16; i++) this.quad([centre, rim[i], rim[i + 1], centre], colour, [level, 0, 0, level]);
  }
  mesh(name: string) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(this.colour, 3));
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({
      vertexColors: true, blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    mesh.name = name;
    mesh.visible = false;
    return mesh;
  }
}

function neonTube(geometry: T.BufferGeometry) {
  return new T.Mesh(geometry, new T.MeshStandardMaterial({ color: "#f1e9d8", emissive: warmWhite, emissiveIntensity: 0, roughness: .35 }));
}

const mastHeight = 100 * .3048;
// The courtyard mast stands on the rosette laid out in market.ts. The second marks the road entry,
// on the left verge ahead of the first palm.
const masts = [
  { name: "Courtyard", centre: sheetPoint(828, 650), foot: .122 },
  { name: "Entrance", centre: entrancePoint(-8.75, entranceLength - .9), foot: -.055 },
];
export const highMastBases = masts.map(({ centre }) => ({ centre, radius: .78 }));

/** Two 100 ft high masts, each with an eight-lamp carriage. */
export function addHighMasts(scene: T.Scene) {
  // Octagonal pedestal, base plate with anchor nuts, and a 16-sided galvanised shaft
  // tapering from 600 to 200 mm across three slip-jointed sections.
  const foot = .55, shaft = mastHeight - foot;
  const radius = (y: number) => .3 - .2 * (y - foot) / shaft;
  const steel = [
    new T.CylinderGeometry(.48, .48, .05, 24).translate(0, foot - .025, 0),
    new T.CylinderGeometry(.1, .3, shaft, 16).translate(0, foot + shaft / 2, 0),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i + .5) * Math.PI / 4;
    steel.push(new T.CylinderGeometry(.035, .035, .09, 6).translate(.4 * Math.cos(a), foot + .045, .4 * Math.sin(a)));
  }
  for (const y of [foot + shaft / 3, foot + 2 * shaft / 3])
    steel.push(new T.CylinderGeometry(radius(y) + .012, radius(y) + .022, .16, 16).translate(0, y, 0));

  // Lantern carriage: service door, ring, spokes and hood carrying eight tilted floodlights.
  const ringY = mastHeight - 1.05;
  const gear = [
    new T.BoxGeometry(.04, .55, .22).translate(radius(1.25) + .005, 1.25, 0),
    new T.TorusGeometry(1.2, .045, 6, 40).rotateX(Math.PI / 2).translate(0, ringY, 0),
    new T.CylinderGeometry(.09, .62, .42, 20).translate(0, mastHeight - .5, 0),
    new T.CylinderGeometry(.05, .1, .2, 12).translate(0, mastHeight + .1, 0),
  ];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    gear.push(new T.CylinderGeometry(.03, .03, 1.1, 6).rotateZ(Math.PI / 2).rotateY(-a)
      .translate(.65 * Math.cos(a), ringY, .65 * Math.sin(a)));
  }
  const lenses: T.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + .5) * Math.PI / 4;
    const aim = new T.Matrix4().compose(
      new T.Vector3(1.2 * Math.cos(a), ringY - .1, 1.2 * Math.sin(a)),
      new T.Quaternion().setFromEuler(new T.Euler(.95, Math.PI / 2 - a, 0, "YXZ")),
      new T.Vector3(1, 1, 1));
    gear.push(new T.BoxGeometry(.5, .14, .34).applyMatrix4(aim));
    lenses.push(new T.BoxGeometry(.44, .1, .02).translate(0, 0, .17).applyMatrix4(aim));
  }
  const lens = new T.MeshStandardMaterial({ color: "#d9dcd6", emissive: "#fff0d4", emissiveIntensity: 0, roughness: .2 });
  const beacon = new T.MeshStandardMaterial({ color: "#6e2620", emissive: "#ff2a10", emissiveIntensity: 0 });
  const parts: [T.BufferGeometry, T.Material][] = [
    [new T.CylinderGeometry(.7, .78, .5, 8).translate(0, .25, 0), new T.MeshStandardMaterial({ color: "#cbc5b6", roughness: .92 })],
    [merged(steel), new T.MeshStandardMaterial({ color: "#a9aeab", metalness: .55, roughness: .42 })],
    [merged(gear), new T.MeshStandardMaterial({ color: "#596163", metalness: .45, roughness: .5 })],
    [merged(lenses), lens],
    [new T.SphereGeometry(.09, 12, 8).translate(0, mastHeight + .29, 0), beacon],
  ];
  for (const { name, centre, foot: ground } of masts) {
    const mast = new T.Group();
    mast.name = name + " 100 ft high-mast light";
    mast.position.set(centre.x, ground, centre.y);
    for (const [geometry, material] of parts) {
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      mast.add(mesh);
    }
    // One downward flood stands in for the eight lamps. Its near plane clears the pole it sits in.
    const flood = new T.SpotLight("#fff1df", 1050, 0, 1.12, .6, 2);
    flood.position.set(0, ringY - .35, 0);
    flood.castShadow = true;
    flood.shadow.mapSize.set(2048, 2048);
    Object.assign(flood.shadow.camera, { near: 4, far: 95 });
    flood.shadow.bias = -.0003;
    flood.shadow.normalBias = .04;
    // Eight lamps on a 2.4 m ring cast a soft-edged shadow, about 0.3 m wide at the foot of the arcades.
    flood.shadow.radius = 4.5;
    flood.visible = false;
    mast.add(flood, flood.target);
    mast.userData.night = (on: boolean) => {
      flood.visible = on;
      lens.emissiveIntensity = on ? 3.2 : 0;
      beacon.emissiveIntensity = on ? 2.4 : 0;
    };
    scene.add(mast);
  }
}

/** Warm-white neon tube along the roof parapet of every building, with its glow on the coping. */
export function addNeonBorder(group: T.Group, parapet: number) {
  const glow = new Glow();
  const tubes = shellBoundaries.map(({ points, insets }) => {
    const edge = (i: number, inset: number, lift: number) => {
      const p = points[i % points.length].clone().addScaledVector(insets[i % points.length], inset);
      return new T.Vector3(p.x, parapet + lift, p.y);
    };
    for (let i = 0; i < points.length; i++)
      glow.quad([edge(i, 0, .006), edge(i + 1, 0, .006), edge(i + 1, .18, .006), edge(i, .18, .006)], warmWhite, [.8, .8, 0, 0]);
    const curve = new T.CatmullRomCurve3(points.map((_, i) => edge(i, .05, .04)), true, "centripetal");
    curve.arcLengthDivisions = points.length * 4;
    return new T.TubeGeometry(curve, points.length * 2, .04, 6, true);
  });
  const neon = neonTube(merged(tubes));
  neon.name = "Warm-white neon roof border";
  const spill = glow.mesh("Neon glow on the coping");
  // Seen from across the site the tube is one pixel wide. It stays above the bloom knee even where it
  // straddles two pixel rows, otherwise the glow breaks into evenly spaced beads.
  neon.userData.night = (on: boolean) => {
    neon.material.emissiveIntensity = on ? 2.6 : 0;
    spill.visible = on;
  };
  group.add(neon, spill);
}

// A 3 W warm-white LED gives about 270 lm. Its pool follows the cosine-cubed falloff of a
// point source at the lantern's height and fades out before it reaches the next shop but one.
const poolRadius = 3.2;

/** One hanging lantern over the arcade in front of each shop door, with a bulb inside and its pool of light. */
export function addShopLanterns(group: T.Group, units: Unit[], floor: Floor, soffit: number, walkway: number) {
  const setback = glassSetback[floor], reach = setback / 2, glassY = soffit - .62, drop = soffit - glassY - .27;
  const frame = merged([
    new T.BoxGeometry(.2, .024, .2).translate(0, .122, 0),
    new T.CylinderGeometry(.025, .15, .1, 4).rotateY(Math.PI / 4).translate(0, .184, 0),
    new T.TorusGeometry(.028, .007, 4, 12).translate(0, .262, 0),
    new T.CylinderGeometry(.008, .008, drop, 5).translate(0, .27 + drop / 2, 0),
    new T.BoxGeometry(.17, .028, .17).translate(0, -.124, 0),
    new T.CylinderGeometry(.04, .004, .07, 4).rotateY(Math.PI / 4).translate(0, -.172, 0),
    new T.CylinderGeometry(.017, .02, .05, 8).translate(0, .085, 0),
    ...[-1, 1].flatMap(x => [-1, 1].map(z => new T.BoxGeometry(.016, .224, .016).translate(.075 * x, 0, .075 * z))),
  ]);
  const bays = wingBoundaries.flatMap(wing => retailBays(wing, units, floor));
  const frames = new T.InstancedMesh(frame,
    new T.MeshStandardMaterial({ color: "#2e2924", metalness: .5, roughness: .45 }), bays.length);
  const glass = new T.MeshStandardMaterial({
    color: "#f3e3c2", emissive: "#ffb872", emissiveIntensity: 0, roughness: .15, transparent: true, opacity: .3, depthWrite: false,
  });
  const panes = new T.InstancedMesh(new T.BoxGeometry(.15, .22, .15), glass, bays.length);
  const filament = new T.MeshStandardMaterial({ color: "#f6efdd", emissive: "#ffcf96", emissiveIntensity: 0, roughness: .4 });
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(.036, 10, 8).scale(1, 1.25, 1).translate(0, .012, 0), filament, bays.length);
  const light = new Glow(), lampHeight = glassY - walkway;
  const spill = (r: number) => .2 * (lampHeight * lampHeight / (r * r + lampHeight * lampHeight)) ** 1.5
    * (1 - T.MathUtils.smoothstep(r, .55 * poolRadius, poolRadius));
  const matrix = new T.Matrix4(), turn = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
  bays.forEach((arcade, index) => {
    const station = doorStation(arcade);
    const at = (along: number, depth: number) => arcade.at(station + along, depth);
    const p = at(0, reach), tangent = at(.2, reach).sub(at(-.2, reach));
    matrix.compose(new T.Vector3(p.x, glassY, p.y), turn.setFromAxisAngle(up, -Math.atan2(tangent.y, tangent.x)), one);
    for (const part of [frames, panes, bulbs]) part.setMatrixAt(index, matrix);
    // ponytail: the pool stops at the arcade edge. Additive light ignores surface colour,
    // so spill onto the darker road outside would read as a glowing patch.
    const from = floor === "first" ? .2 : 0, columns = 12, rows = Math.ceil((setback - from) / .45);
    const corner = (i: number, j: number) => {
      const along = poolRadius * (2 * i / columns - 1), depth = from + (setback - from) * j / rows;
      const q = at(along, depth);
      return { point: new T.Vector3(q.x, walkway + .006, q.y), level: spill(Math.hypot(along, depth - reach)) };
    };
    for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
      const corners = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      light.quad(corners.map(c => c.point), "#ffb56a", corners.map(c => c.level));
    }
  });
  const pools = light.mesh("Lantern light pools");
  frames.name = "Lantern frames";
  panes.name = "Lantern glass";
  bulbs.name = "Lantern bulbs";
  frames.receiveShadow = true;
  const lanterns = new T.Group();
  lanterns.name = "3 W shop lanterns";
  lanterns.add(frames, bulbs, panes, pools);
  lanterns.userData.night = (on: boolean) => {
    filament.emissiveIntensity = on ? 3 : 0;
    glass.emissiveIntensity = on ? .5 : 0;
    pools.visible = on;
  };
  group.add(lanterns);
}

// Heights match entranceFountain.ts: the basin water line and the top of the wall coping.
const waterLevel = .496, wallTop = 2.835;
const paving = .10, turf = -.055;

/** Uplights under the eight entrance palms, lamps in the fountain basins, a lit border on the wall and a sign flood. */
export function addEntranceLights(scene: T.Scene) {
  const group = new T.Group();
  group.name = "Entrance lighting";
  group.position.set(entranceOrigin.x, 0, entranceOrigin.y);
  group.rotation.y = entranceYaw;
  scene.add(group);
  const bodies: T.BufferGeometry[] = [], lenses: T.BufferGeometry[] = [], lamps: T.SpotLight[] = [];
  function uplight(x: number, ground: number, z: number, aim: T.Vector3, candela: number, spread: number, range: number, decay: number) {
    bodies.push(new T.CylinderGeometry(.085, .1, .07, 12).translate(x, ground + .035, z));
    lenses.push(new T.CylinderGeometry(.062, .062, .012, 12).translate(x, ground + .074, z));
    const lamp = new T.SpotLight("#ffc98c", candela, range, spread, 1, decay);
    lamp.position.set(x, ground + .09, z);
    lamp.target.position.copy(aim);
    lamp.visible = false;
    group.add(lamp, lamp.target);
    lamps.push(lamp);
  }
  // In-ground uplights sit on the road side of each palm. A linear falloff keeps the trunk
  // and the crown evenly lit instead of burning out the bark beside the lamp.
  for (const palm of entrancePalmTrunks) {
    const ground = palm.x > 0 ? paving : turf;
    uplight(palm.x - Math.sign(palm.x) * .5, ground, palm.z, new T.Vector3(palm.x, ground + 5, palm.z), 10, .45, 10, 1);
  }
  // One flood at the kerb lights the planted sign.
  uplight(face - 2.3, paving, entranceSign.z, new T.Vector3(face, 1.6, entranceSign.z), 16, .78, 8, 2);

  const glow = new Glow();
  const [wall, ...basins] = entranceFountainFootprints;
  for (const basin of basins) {
    const x = (basin.minX + basin.maxX) / 2 - .1, z = (basin.minZ + basin.maxZ) / 2, width = basin.maxZ - basin.minZ;
    // Submerged lamps show through the surface, and their light grazes up the stone behind.
    for (const offset of [-.29, 0, .29]) glow.disc(new T.Vector3(x, waterLevel + .006, z + offset * width), .26, "#c9ecff", .8);
    const stone = face - .16, left = z - width / 2 + .12, right = z + width / 2 - .12;
    glow.quad([new T.Vector3(stone, waterLevel, left), new T.Vector3(stone, waterLevel, right),
      new T.Vector3(stone, waterLevel + 1.6, right), new T.Vector3(stone, waterLevel + 1.6, left)], "#c9ecff", [.26, .26, 0, 0]);
  }
  // The border runs along the front of the coping and down the outer end of the wall.
  const x = face - .035, top = wallTop + .03, start = eastFacadeAt(face), end = wall.maxZ + .035;
  const border = neonTube(merged([
    new T.CylinderGeometry(.028, .028, end - start, 8).rotateX(Math.PI / 2).translate(x, top, (start + end) / 2),
    new T.CylinderGeometry(.028, .028, top - .22, 8).translate(x, (top + .22) / 2, end),
  ]));
  border.name = "Fountain wall border light";
  glow.quad([new T.Vector3(face - .008, wallTop - .055, start), new T.Vector3(face - .008, wallTop - .055, end),
    new T.Vector3(face - .008, wallTop - .7, end), new T.Vector3(face - .008, wallTop - .7, start)], warmWhite, [.3, .3, 0, 0]);

  const lens = new T.MeshStandardMaterial({ color: "#e9e2d0", emissive: "#ffd9a8", emissiveIntensity: 0, roughness: .25 });
  const housings = new T.Mesh(merged(bodies), new T.MeshStandardMaterial({ color: "#3a332b", metalness: .5, roughness: .5 }));
  housings.name = "Uplight housings";
  housings.receiveShadow = true;
  const washes = glow.mesh("Fountain and wall light washes");
  washes.renderOrder = 1;
  group.add(housings, new T.Mesh(merged(lenses), lens), border, washes);
  group.userData.night = (on: boolean) => {
    for (const lamp of lamps) lamp.visible = on;
    lens.emissiveIntensity = on ? 2.4 : 0;
    border.material.emissiveIntensity = on ? 1.5 : 0;
    washes.visible = on;
  };
}
