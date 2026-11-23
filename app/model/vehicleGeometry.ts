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
/** Lenses glow faintly by day and fully when the viewer switches the market to night. */
export function lamps(group: T.Object3D, pieces: T.BufferGeometry[]) {
  const mesh = assemble(group, pieces, vehicleFinish("lamp"));
  const material = mesh.material as T.MeshStandardMaterial;
  mesh.userData.night = (on: boolean) => { material.emissiveIntensity = on ? 2.6 : .06; };
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

export function roadShadow(group:T.Group, material:T.Material, width:number, length:number) {
  const shadow = new T.Mesh(new T.PlaneGeometry(width, length), material);
  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = .011;
  group.add(shadow);
}
