import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const temp = new T.Object3D();
export function part(bucket: T.BufferGeometry[], geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0,
  sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute("uv");
  temp.position.set(x, y, z); temp.scale.set(sx, sy, sz); temp.rotation.set(rx, ry, rz); temp.updateMatrix();
  g.applyMatrix4(temp.matrix);
  const colors = new T.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 3), 3);
  const tint = new T.Color(color);
  for (let i = 0; i < colors.count; i++)colors.setXYZ(i, tint.r, tint.g, tint.b);
  g.setAttribute("color", colors); bucket.push(g);
}
export function box(bucket: T.BufferGeometry[], color: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
  part(bucket, new T.BoxGeometry(w, h, d), color, x, y, z, 1, 1, 1, rx, ry, rz);
}
export function assemble(group: T.Object3D, pieces: T.BufferGeometry[], props: T.MeshStandardMaterialParameters | T.Material) {
  const material = props instanceof T.Material ? props :
    new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, ...props });
  const mesh = new T.Mesh(mergeGeometries(pieces)!, material);
  pieces.forEach(g => g.dispose());
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

let reflections: T.Texture | undefined;
/** Street-level panorama reflected by vehicles: overcast sky, a broken line of
 * shopfronts and trees at the horizon, then pale paving fading to asphalt. */
export function vehicleEnvironment() {
  if (reflections) return reflections;
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const sky = c.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, "#93aec3"); sky.addColorStop(.75, "#d6e2e7"); sky.addColorStop(1, "#f3f1e8");
  c.fillStyle = sky; c.fillRect(0, 0, 512, 128);
  const ground = c.createLinearGradient(0, 128, 0, 256);
  ground.addColorStop(0, "#a49f92"); ground.addColorStop(.35, "#6e6a62"); ground.addColorStop(1, "#34332f");
  c.fillStyle = ground; c.fillRect(0, 128, 512, 128);
  let seed = 7;
  const next = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let x = 0; x < 512;) {
    const w = 14 + next() * 46, h = 5 + next() * 20, tree = next() < .3;
    c.fillStyle = tree ? "#5f6d5a" : ["#8f8b80", "#a59e8e", "#7b7f78"][Math.floor(next() * 3)];
    if (tree) { c.beginPath(); c.ellipse(x + w / 2, 128 - h * .6, w / 2, h * .8, 0, 0, Math.PI * 2); c.fill(); }
    else c.fillRect(x, 128 - h, w, h);
    x += w + next() * 10;
  }
  reflections = new T.CanvasTexture(canvas);
  reflections.mapping = T.EquirectangularReflectionMapping;
  reflections.colorSpace = T.SRGBColorSpace;
  return reflections;
}

export type Finish = "paint" | "glass" | "chrome" | "metal" | "plastic" | "rubber" | "lamp";
const finishes: Record<Finish, T.MeshPhysicalMaterialParameters> = {
  // Two-coat automotive paint: satin metallic base under a glossy clear coat.
  paint: { roughness: .42, metalness: .3, clearcoat: 1, clearcoatRoughness: .06 },
  glass: { roughness: .05, metalness: 0, envMapIntensity: 1.5 },
  chrome: { roughness: .14, metalness: 1 },
  metal: { roughness: .4, metalness: .8 },
  plastic: { roughness: .62, metalness: 0, envMapIntensity: .55 },
  rubber: { roughness: .9, metalness: 0, envMapIntensity: .3 },
  lamp: { roughness: .1, metalness: 0, emissive: "#ffffff", emissiveIntensity: .06 },
};
/** Vertex colours carry each part's hue; the finish decides how it takes the light.
 * Every call returns a new material, so fading one vehicle never fades another. */
export function vehicleFinish(kind: Finish, extra: T.MeshPhysicalMaterialParameters = {}) {
  const props = { vertexColors: true, side: T.DoubleSide, envMap: vehicleEnvironment(), ...finishes[kind], ...extra };
  const material = kind === "paint" ? new T.MeshPhysicalMaterial(props) : new T.MeshStandardMaterial(props);
  // Lamp lenses emit in their own vertex colour: white heads, amber indicators, red tails.
  if (kind === "lamp") material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;");
  };
  return material;
}
/** Lenses glow faintly by day and fully when the viewer switches the market to night; the daylit street panorama the
 * vehicle's finishes reflect dims with the night, which their own envMap would otherwise keep lit. */
export function lamps(group: T.Object3D, pieces: T.BufferGeometry[]) {
  const mesh = assemble(group, pieces, vehicleFinish("lamp"));
  const material = mesh.material as T.MeshStandardMaterial;
  mesh.userData.night = (on: boolean) => {
    material.emissiveIntensity = on ? 2.6 : .06;
    group.traverse(object => {
      const finish = (object as T.Mesh).material as T.MeshStandardMaterial | undefined;
      if (finish?.envMap && finish.envMap === reflections) finish.envMapIntensity = (finish.userData.day ??= finish.envMapIntensity) * (on ? .15 : 1);
    });
  };
  return mesh;
}

type Point = [number, number, number];
export function rod(parts: T.BufferGeometry[], color: string, start: Point, end: Point, r1: number, r2 = r1) {
  const a = new T.Vector3(...start), b = new T.Vector3(...end), direction = b.clone().sub(a);
  const g = new T.CylinderGeometry(r2, r1, direction.length(), 10);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()));
  a.lerp(b, .5);
  part(parts, g, color, a.x, a.y, a.z);
}
export function oval(parts: T.BufferGeometry[], color: string, x: number, y: number, z: number,
  w: number, h: number, d: number, lean = 0) {
  part(parts, new T.SphereGeometry(.5, 12, 9), color, x, y, z, w, h, d, lean);
}

/** Side-profile corner: [z, y, fillet radius, radius of the edge where it meets the flat sides]. */
export type Corner = [number, number, number?, number?];

/** Dense closed polyline through filleted corners, each point carrying its corner's edge radius. */
export function profile(corners: Corner[], steps = 5) {
  const out: number[][] = [], n = corners.length;
  corners.forEach(([z, y, fillet = 0, edge = 0], i) => {
    if (!fillet) return void out.push([z, y, edge]);
    const toward = (k: number) => {
      const [pz, py] = corners[(i + k + n) % n], d = Math.hypot(pz - z, py - y), s = Math.min(fillet, d / 2) / d;
      return [z + (pz - z) * s, y + (py - y) * s];
    };
    const a = toward(-1), b = toward(1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * z + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1], edge]);
    }
  });
  return out.filter((p, i) => Math.hypot(p[0] - out[(i + 1) % out.length][0], p[1] - out[(i + 1) % out.length][1]) > 1e-4);
}

/** Flat side-profile panel between two x planes, with optional openings. */
export function slab(bucket: T.BufferGeometry[], color: string, corners: Corner[], x0: number, x1: number, holes: Corner[][] = []) {
  const path = (c: Corner[]) => profile(c).map(([z, y]) => new T.Vector2(z, y));
  const shape = new T.Shape(path(corners));
  shape.holes = holes.map(h => new T.Path(path(h)));
  const g = new T.ExtrudeGeometry(shape, { depth: Math.abs(x1 - x0), bevelEnabled: false });
  part(bucket, g.rotateY(-Math.PI / 2).translate(Math.max(x0, x1), 0, 0), color);
}

/** Number plate facing ±z, yellow commercial by default (white private on cars); dark bars stand in for
 * the registration beside the blue IND strip. `k` scales the lettering and border. */
export function plate(bucket: T.BufferGeometry[], y: number, z: number, lines: number[][], dir: number,
  color = "#efc232", w = .34, k = 1) {
  const h = (.03 + lines.length * .075) * k, face = z + dir * .006;
  box(bucket, color, 0, y, z, w, h, .01);
  box(bucket, "#30509b", -dir * (w / 2 - .018 * k), y, face, .02 * k, h - .03 * k, .002);
  lines.forEach((groups, row) => {
    let x = -(groups.reduce((a, b) => a + b) * .026 + (groups.length - 1) * .02) * k / 2 + .013 * k;
    const cy = y + ((lines.length - 1) * .0375 - row * .075) * k;
    for (const count of groups) {
      for (let i = 0; i < count; i++, x += .026 * k) box(bucket, "#1b1b1b", dir * (x + .011 * k), cy, face, .017 * k, .046 * k, .002);
      x += .02 * k;
    }
  });
}

export function roadShadow(group:T.Group, material:T.Material, width:number, length:number) {
  const shadow = new T.Mesh(new T.PlaneGeometry(width, length), material);
  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = .011;
  group.add(shadow);
}
