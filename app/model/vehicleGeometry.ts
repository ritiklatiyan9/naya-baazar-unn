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
export function assemble(group: T.Object3D, pieces: T.BufferGeometry[], props: T.MeshStandardMaterialParameters) {
  const mesh = new T.Mesh(mergeGeometries(pieces)!, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, ...props }));
  pieces.forEach(g => g.dispose());
  mesh.receiveShadow = true;
  group.add(mesh);
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
