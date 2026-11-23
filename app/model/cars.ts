import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { assemble, box, part, roadShadow } from "./vehicleGeometry";

const up = new T.Vector3(0, 1, 0);

type Section = [z: number, halfWidth: number, top: number];
/** Transverse coachwork sections, with radiused shoulders and a raised sill. */
function coachwork(sections: Section[], bottom: number) {
  const rings = sections.map(([z, w, h]) => [
    [-w * .88, bottom, z], [-w, bottom + .14, z], [-w * .98, h - .12, z], [-w * .81, h - .015, z],
    [-w * .45, h + .022, z], [w * .45, h + .022, z], [w * .81, h - .015, z], [w * .98, h - .12, z],
    [w, bottom + .14, z], [w * .88, bottom, z],
  ]);
  const positions: number[] = [];
  function triangle(a: number[], b: number[], c: number[]) { positions.push(...a, ...b, ...c); }
  for (let i = 1; i < rings.length; i++) {
    const from = rings[i - 1], to = rings[i];
    for (let j = 0; j < to.length; j++) {
      const n = (j + 1) % to.length;
      triangle(from[j], to[j], to[n]); triangle(from[j], to[n], from[n]);
    }
  }
  for (let j = 1; j < 9; j++) {
    triangle(rings[0][0], rings[0][j], rings[0][j + 1]);
    const last = rings[rings.length - 1]; triangle(last[0], last[j + 1], last[j]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export function car(parent: T.Group, paint: string, suv: boolean, shadowMaterial: T.Material) {
  const group = new T.Group(); group.name = suv ? "Moving crossover" : "Moving saloon";
  parent.add(group);
  const details: T.BufferGeometry[] = [];
  const shell: T.BufferGeometry[] = [];
  const glass: T.BufferGeometry[] = [];
  const scale = suv ? 1.04 : 1, height = suv ? 1.63 : 1.45;
  const temp = new T.Object3D();
  function panel(bucket: T.BufferGeometry[], verts: number[][], color: string) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(i => verts[i]), 3)); g.computeVertexNormals();
    part(bucket, g, color);
  }
  function strut(color: string, a: T.Vector3, b: T.Vector3, width: number, depth: number) {
    const d = b.clone().sub(a), middle = a.clone().lerp(b, .5);
    const g = new T.BoxGeometry(width, d.length(), depth);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up, d.normalize()));
    part(shell, g, color, middle.x, middle.y, middle.z);
  }
  part(shell, coachwork([[-2.10, .72, .79], [-1.94, .86, .89], [-1.32, .89, .94], [-.55, .9, .94],
  [.65, .89, .91], [1.58, .86, .83], [2.03, .75, .75]], .37), paint);
  const roofRear = suv ? -1.31 : -.91, rear = suv ? -1.75 : -1.62, front = 1.01, roofFront = .35;
  const w = .817, top = .664, low = .90;
  panel(glass, [[-w, low, front], [w, low, front], [top, height, roofFront], [-top, height, roofFront]], "#8faab4");
  panel(glass, [[w, low, rear], [-w, low, rear], [-top, height, roofRear], [top, height, roofRear]], "#738e9a");
  panel(shell, [[-top, height + .012, roofRear], [-top, height + .012, roofFront], [top, height + .012, roofFront], [top, height + .012, roofRear]], paint);
  for (const sign of [-1, 1]) {
    const sideWin = [[w * sign, low, rear], [w * sign, low, front], [top * sign, height, roofFront], [top * sign, height, roofRear]];
    panel(glass, sideWin, "#829ca7");
    const v = (p: number[]) => new T.Vector3(...p as [number, number, number]);
    strut(paint, v(sideWin[1]), v(sideWin[2]), .055, .068);
    strut(paint, v(sideWin[0]), v(sideWin[3]), .062, .105);
    strut("#292e30", new T.Vector3(sign * w, low, -.28), new T.Vector3(sign * top, height, -.33), .055, .085);
    box(shell, "#a4abb0", sign * w, .895, -.22, .034, .025, 2.28);
    box(details, "#363b3b", sign * .895, .525, -.10, .035, .06, 3.30);
    box(details, "#c6c8c5", sign * .895, .825, .13, .025, .025, .16);
    box(details, "#c6c8c5", sign * .895, .825, -.96, .025, .025, .16);
    part(shell, new T.SphereGeometry(.5, 10, 6), paint, sign * .92, .965, .62, .218, .15, .225);
    box(details, "#eae8db", sign * .58, .742, 1.99, .33, .11, .038, 0, -sign * .12, 0);
    box(details, "#a44841", sign * .60, .757, -2.076, .27, .105, .035);
    for (const z of [-.93, .39]) {
      box(details, "#545358", sign * .37, .86, z, .49, .51, .19, -.18);
      box(details, "#555258", sign * .37, 1.08, z - .06, .205, .177, .13, -.10);
    }
  }
  // Driver behind the windscreen; the cabin is fully enclosed by transparent panes.
  part(details, new T.SphereGeometry(.5, 10, 6), "#b4896b", .35, 1.16, .44, .18, .21, .19);
  part(details, new T.SphereGeometry(.5, 10, 6), "#443a37", .35, 1.23, .434, .178, .095, .18);
  box(details, "#4a6063", .35, .962, .43, .31, .35, .18);
  box(details, "#302f30", 0, .55, 2.014, .79, .12, .041);
  box(details, "#d4d2bf", 0, .583, 2.039, .33, .075, .015);
  box(details, "#302f30", 0, .48, -2.087, 1.11, .08, .04);
  assemble(group, details, { roughness: .56 });
  assemble(group, shell, { roughness: .33, metalness: .22 });
  assemble(group, glass, { roughness: .21, metalness: .10, transparent: true, opacity: .67, depthWrite: false });
  const tireParts: T.BufferGeometry[] = [];
  const cylinder = (r: number, h: number) => new T.CylinderGeometry(r, r, h, 18).rotateZ(Math.PI / 2);
  part(tireParts, cylinder(.324, .17), "#292a29");
  for (const side of [-1, 1]) {
    part(tireParts, cylinder(.222, .011), "#a9a9a3", side * .09);
    part(tireParts, cylinder(.172, .013), "#3e4140", side * .099);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      box(tireParts, "#b5b7b2", side * .111, .072 * Math.cos(a), .072 * Math.sin(a), .015, .16, .036, a);
    }
    part(tireParts, cylinder(.052, .013), "#b0b2b1", side * .122);
  }
  const wheels = new T.InstancedMesh(mergeGeometries(tireParts)!, new T.MeshStandardMaterial({ vertexColors: true, roughness: .72 }), 4);
  tireParts.forEach(g => g.dispose()); group.add(wheels);
  wheels.instanceMatrix.setUsage(T.DynamicDrawUsage);
  wheels.frustumCulled = false;
  group.scale.setScalar(scale);
  roadShadow(group, shadowMaterial, 2.28, 4.6);
  function update(point: T.Vector3, heading: number, distance: number) {
    group.position.set(point.x, .032, point.z); group.rotation.y = heading;
    const rotation = (distance / (.324 * scale)) % (2 * Math.PI);
    let i = 0;
    for (const side of [-1, 1]) for (const z of [-1.27, 1.28]) {
      temp.position.set(side * .84, .324, z); temp.rotation.set(rotation, 0, 0); temp.scale.set(1, 1, 1);
      temp.updateMatrix(); wheels.setMatrixAt(i++, temp.matrix);
    }
    wheels.instanceMatrix.needsUpdate = true;
  }
  return update;
}
