import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sheetPoint } from "./geometry";
import { contactTexture } from "./shoppers";

const up = new T.Vector3(0, 1, 0);
export function trafficLane() {
  // Centreline surveyed from the two pavement edges; end turns stay within the mouths of the drive.
  const axis = [[337, 773], [344, 731], [355, 693], [374, 651], [403, 617], [446, 592],
  [493, 578], [544, 574], [602, 583], [666, 585], [722, 575], [773, 551],
  [804, 517], [822, 474], [830, 420], [830, 359], [829, 300], [829, 240], [832, 187]];
  const center = new T.CatmullRomCurve3(axis.map(([x, y]) => {
    const p = sheetPoint(x, y); return new T.Vector3(p.x, 0, p.y);
  }));
  const points: T.Vector3[] = [];
  const n = 60, radius = 2.85;
  function axes(u: number) {
    const p = center.getPointAt(u), tangent = center.getTangentAt(u);
    return { p, tangent, side: new T.Vector3(tangent.z, 0, -tangent.x) };
  }
  for (let i = 0; i <= n; i++) {
    const { p, side } = axes(i / n);
    points.push(p.addScaledVector(side, radius));
  }
  for (let i = 1; i < 12; i++) {
    const { p, side, tangent } = axes(1), theta = i * Math.PI / 12;
    points.push(p.addScaledVector(side, radius * Math.cos(theta)).addScaledVector(tangent, radius * Math.sin(theta)));
  }
  for (let i = n; i >= 0; i--) {
    const { p, side } = axes(i / n); points.push(p.addScaledVector(side, -radius));
  }
  for (let i = 1; i < 12; i++) {
    const { p, side, tangent } = axes(0), theta = i * Math.PI / 12;
    points.push(p.addScaledVector(side, -radius * Math.cos(theta)).addScaledVector(tangent, -radius * Math.sin(theta)));
  }
  const lane = new T.CatmullRomCurve3(points, true, "centripetal");
  lane.arcLengthDivisions = 640;
  return lane;
}

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

function car(parent: T.Group, paint: string, suv: boolean) {
  const group = new T.Group(); group.name = suv ? "Moving crossover" : "Moving saloon";
  parent.add(group);
  const details: T.BufferGeometry[] = [];
  const shell: T.BufferGeometry[] = [];
  const glass: T.BufferGeometry[] = [];
  const scale = suv ? 1.04 : 1, height = suv ? 1.63 : 1.45;
  const temp = new T.Object3D();
  function part(bucket: T.BufferGeometry[], geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0,
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
  function box(bucket: T.BufferGeometry[], color: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    part(bucket, new T.BoxGeometry(w, h, d), color, x, y, z, 1, 1, 1, rx, ry, rz);
  }
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
  function assemble(pieces: T.BufferGeometry[], props: T.MeshStandardMaterialParameters) {
    const mesh = new T.Mesh(mergeGeometries(pieces)!, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, ...props }));
    pieces.forEach(g => g.dispose());
    mesh.receiveShadow = true; group.add(mesh);
  }
  assemble(details, { roughness: .56 });
  assemble(shell, { roughness: .33, metalness: .22 });
  assemble(glass, { roughness: .21, metalness: .10, transparent: true, opacity: .67, depthWrite: false });
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
  const shadow = new T.Mesh(new T.PlaneGeometry(2.28, 4.6), new T.MeshBasicMaterial({
    map: contactTexture(), transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .011; group.add(shadow);
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

export function createTraffic(parent: T.Group) {
  const lane = trafficLane(), distance = lane.getLength();
  const cars = [car(parent, "#a15e4d", false), car(parent, "#d3c9ae", true), car(parent, "#547674", false)];
  const point = new T.Vector3(), tangent = new T.Vector3();
  return (time: number) => {
    const travel = time * 2.65;
    cars.forEach((position, i) => {
      const u = T.MathUtils.euclideanModulo(travel / distance + [.25, .51, .86][i], 1);
      lane.getPointAt(u, point); lane.getTangentAt(u, tangent);
      position(point, Math.atan2(tangent.x, tangent.z), travel);
    });
  };
}
