import * as T from "three";
import { Parts, sheetPoint, type Unit } from "./geometry";
import { buildMarketActivity } from "./marketActivity";
import { asphaltTexture, courtyardRosette, paverTexture, turfTexture } from "./siteMaterials";
import { boardOutline, entranceLength, entranceOrigin, entrancePoint, entranceWidth, entranceYaw } from "./entranceLayout";
import { addEntranceFountain } from "./entranceFountain";
import { addEntrancePalms, entrancePalmTrunks } from "./entrancePalms";

function surface(shape: T.Shape, color: string, thickness: number, y: number, texture?: T.Texture) {
  const geometry = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 18 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const top = new T.MeshStandardMaterial({ color, roughness: 0.94, map: texture ?? null });
  const side = new T.MeshStandardMaterial({
    color: new T.Color(color).multiplyScalar(0.78),
    roughness: 0.93,
  });
  const mesh = new T.Mesh(geometry, [top, side]);
  mesh.receiveShadow = mesh.castShadow = true;
  return mesh;
}

class SiteShape extends T.Shape {
  move(x: number, y: number) {
    const p = sheetPoint(x, y);
    return this.moveTo(p.x, -p.y);
  }
  line(x: number, y: number) {
    const p = sheetPoint(x, y);
    return this.lineTo(p.x, -p.y);
  }
  curve(x: number, y: number, x2: number, y2: number, x3: number, y3: number) {
    const a = sheetPoint(x, y),
      b = sheetPoint(x2, y2),
      c = sheetPoint(x3, y3);
    return this.bezierCurveTo(a.x, -a.y, b.x, -b.y, c.x, -c.y);
  }
}

function groundShape(points: T.Vector2[]) {
  return new T.Shape(points.map(p => new T.Vector2(p.x, -p.y)));
}

function buildEntrance(scene: T.Scene, asphaltMap: T.Texture, stone: T.Texture) {
  const half = entranceWidth / 2;
  const corners = (left: number, right: number) => [
    entrancePoint(left, 0), entrancePoint(right, 0),
    entrancePoint(right, entranceLength), entrancePoint(left, entranceLength),
  ];
  const road = surface(groundShape(corners(-half, half)), "#827c76", .087, -.055, asphaltMap);
  road.name = "Entrance asphalt";
  scene.add(road);

  const pavement = groundShape(corners(half, 9.88));
  const beds = new Parts();
  for (const palm of entrancePalmTrunks) {
    if (palm.x < 0) continue;
    const rim = .43;
    const ring = [[-rim, -rim], [-rim, rim], [rim, rim], [rim, -rim]].map(([x, z]) => {
      const point = entrancePoint(palm.x + x, palm.z + z);
      return new T.Vector2(point.x, -point.y);
    });
    pavement.holes.push(new T.Path(ring));
    beds.box("#65533d", palm.x, .032, palm.z, rim * 2, .065, rim * 2);
  }
  const walk = surface(pavement, "#e3d7c0", .155, -.055, stone);
  walk.name = "Entrance fountain walk";
  scene.add(walk);

  const landscape = new T.Group();
  landscape.name = "Entrance landscaping";
  landscape.position.set(entranceOrigin.x, 0, entranceOrigin.y);
  landscape.rotation.y = entranceYaw;
  scene.add(landscape);
  beds.build(landscape);
  addEntrancePalms(landscape);
  return addEntranceFountain(landscape);
}
function tree(parts: Parts, px: number, pz: number, size: number, seed: number, planter: boolean) {
  const { x, y: z } = sheetPoint(px, pz);
  const base = planter ? 0.13 : -0.055;
  if (planter) {
    parts.add("pole", "#aba699", new T.Vector3(x, 0.13, z), new T.Vector3(1.35, 0.07, 1.35));
    parts.add("pole", "#5a5549", new T.Vector3(x, 0.17, z), new T.Vector3(1.18, 0.025, 1.18));
  }
  const v = (dx: number, y: number, dz: number) =>
    new T.Vector3(x + dx * size, base + y * size, z + dz * size);
  parts.rod("#706345", v(0, 0, 0), v(0.04, 0.7, 0), 0.047 * size);
  const palette = ["#56694f", "#788769", "#899473", "#647a59", "#748367"];
  for (let i = 0; i < 6; i++) {
    const a = seed * 0.78 + i * 2.39996,
      r = i === 5 ? 0 : 0.23;
    const dx = Math.sin(a) * r,
      dz = Math.cos(a) * r,
      h = i === 5 ? 0.96 : 0.72 + (i % 3) * 0.065;
    parts.rod("#766648", v(0.02, 0.38, 0), v(dx, h, dz), 0.023 * size);
    parts.add(
      "crown",
      palette[(seed + i) % palette.length],
      v(dx, h, dz),
      new T.Vector3(0.53, 0.53 + (i % 2) * 0.14, 0.55).multiplyScalar(size),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a),
    );
  }
}

function parkedBike(
  parts: Parts,
  px: number,
  pz: number,
  heading: number,
  color: string,
  kind: "scooter" | "cycle",
) {
  const { x, y: z } = sheetPoint(px, pz),
    yaw = (heading * Math.PI) / 180,
    unitQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const at = (dx: number, y: number, dz: number) =>
    new T.Vector3(dx, y, dz).applyQuaternion(unitQ).add(new T.Vector3(x, 0.11, z));
  function box(c: string, dx: number, y: number, dz: number, w: number, h: number, l: number) {
    const p = at(dx, y, dz);
    parts.box(c, p.x, p.y, p.z, w, h, l, yaw);
  }
  function ball(c: string, dx: number, y: number, dz: number, w: number, h: number, l: number) {
    parts.add("round", c, at(dx, y, dz), new T.Vector3(w, h, l), unitQ);
  }
  const bicycle = kind === "cycle",
    wheelY = bicycle ? 0.34 : 0.31;
  const ringQ = unitQ
    .clone()
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2));
  for (const dz of [-0.68, 0.68]) {
    parts.add("ring", "#34372e", at(0, wheelY, dz), new T.Vector3(0.7, 0.7, bicycle ? 0.8 : 2.1), ringQ);
    for (const d of [-1, 1])
      parts.rod("#827f70", at(0, wheelY - 0.24, dz + d * 0.1), at(0, wheelY + 0.24, dz - d * 0.1), 0.018);
  }
  parts.rod(color, at(0, wheelY, -0.68), at(0, 0.81, -0.18), 0.038);
  parts.rod(color, at(0, 0.81, -0.18), at(0, 0.36, 0.02), 0.046);
  parts.rod(color, at(0, 0.36, 0.02), at(0, 0.92, 0.37), 0.045);
  parts.rod(color, at(0, 0.82, -0.18), at(0, 0.9, 0.37), 0.034);
  parts.rod("#787a6c", at(0, wheelY, 0.68), at(0, 1.12, 0.38), 0.035);
  parts.rod("#4c4d41", at(-0.24, 1.12, 0.38), at(0.24, 1.12, 0.38), 0.035);
  if (!bicycle) {
    ball(color, 0, 0.6, -0.18, 0.53, 0.62, 1.12);
    ball(color, 0, 0.8, 0.43, 0.4, 0.73, 0.33);
    box("#e9debd", 0, 1.0, 0.54, 0.21, 0.16, 0.08);
  }
  ball("#393d36", 0, 0.9, -0.23, bicycle ? 0.21 : 0.4, 0.13, bicycle ? 0.34 : 0.74);
}

// The carriageway separates the two paved wings. Both independent paving meshes
// share its exact Bézier edges, leaving a shallow, continuous stone kerb.
function carriagewaySides() {
  const west = new T.Path();
  west.moveTo(287, 768);
  west.bezierCurveTo(294, 698, 315, 639, 365, 593);
  west.bezierCurveTo(416, 541, 481, 518, 552, 523);
  west.lineTo(629, 538);
  west.bezierCurveTo(708, 553, 766, 501, 779, 424);
  west.bezierCurveTo(783, 400, 783, 378, 783, 352);
  west.lineTo(783, 194);
  west.lineTo(793, 151);
  const east = new T.Path();
  east.moveTo(875, 156);
  east.lineTo(875, 416);
  east.bezierCurveTo(875, 536, 788, 626, 668, 629);
  east.lineTo(548, 629);
  east.bezierCurveTo(467, 629, 411, 671, 395, 753);
  east.lineTo(388, 817);
  return { west: west.getPoints(36), east: east.getPoints(36) };
}

function insetKerb(points: T.Vector2[]) {
  const vertices: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const ia = sheetPoint(points[i].x, points[i].y);
    const ib = sheetPoint(points[i + 1].x, points[i + 1].y);
    const direction = ib.clone().sub(ia).normalize();
    const offset = new T.Vector2(direction.y, -direction.x).multiplyScalar(0.16);
    const oa = ia.clone().add(offset), ob = ib.clone().add(offset);
    for (const point of [ia, ib, oa, oa, ib, ob]) vertices.push(point.x, 0.118, point.y);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const kerb = new T.Mesh(geo, new T.MeshStandardMaterial({ color: "#c9c6ba", roughness: 0.9, side: T.DoubleSide }));
  kerb.receiveShadow = true;
  return kerb;
}

export function buildMarket(scene: T.Scene, groundUnits: Unit[], firstUnits: Unit[]) {
  const board = groundShape(boardOutline);
  const base = surface(board, "#827768", 0.66, -1.05);
  base.name = "Model plinth";
  scene.add(base);
  scene.add(surface(board, "#474b42", 0.19, -0.39));
  const turf = surface(board, "#ffffff", 0.145, -0.2, turfTexture());
  turf.material[1].color.set("#48614d");
  scene.add(turf);

  const { east, west } = carriagewaySides();
  const westCourt = new SiteShape();
  westCourt.move(287, 768).line(258, 755).line(101, 615).line(169, 460)
    .line(196, 471).line(216, 379).line(684, 476).line(725, 293)
    .line(764, 302).line(793, 151);
  west.slice(0, -1).reverse().forEach(p => westCourt.line(p.x, p.y));
  westCourt.closePath();

  const eastCourt = new SiteShape();
  eastCourt.move(875, 156).line(944, 160).line(944, 478).line(1346, 479)
    .line(1420, 824).line(1389, 828).line(1388, 821).line(922, 823)
    .line(674, 826).line(388, 818).line(388, 817);
  east.slice(0, -1).reverse().forEach(p => eastCourt.line(p.x, p.y));
  eastCourt.closePath();
  const stone = paverTexture();
  for (const court of [westCourt, eastCourt]) {
    const paving = surface(court, "#ffffff", 0.165, -0.055, stone);
    paving.material[1].color.set("#b9b5a8");
    scene.add(paving);
  }
  const road = new SiteShape();
  const joinLeft = entrancePoint(-entranceWidth / 2, 0), joinRight = entrancePoint(entranceWidth / 2, 0);
  road.moveTo(joinLeft.x, -joinLeft.y);
  west.forEach(p => road.line(p.x, p.y));
  road.line(797, 128).line(875, 128);
  east.forEach(p => road.line(p.x, p.y));
  road.lineTo(joinRight.x, -joinRight.y).closePath();
  const asphaltMap = asphaltTexture();
  const asphalt = surface(road, "#ffffff", 0.087, -0.055, asphaltMap);
  asphalt.name = "Market carriageway";
  asphalt.material[1].color.set("#60636a");
  scene.add(asphalt, insetKerb(west), insetKerb(east));

  const detail = new Parts();
  const med = sheetPoint(828, 650);
  const radius = med.distanceTo(sheetPoint(888, 650));
  const disc = new T.Mesh(new T.CircleGeometry(radius, 120), courtyardRosette());
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(med.x, 0.122, med.y);
  disc.receiveShadow = true;
  scene.add(disc);

  [[907, 590], [1164, 701]].forEach(([x, z], i) =>
    tree(detail, x, z, 3.2 + i * 0.2, i, true));
  [[200, 342], [635, 396], [1000, 254], [1314, 416], [173, 748]].forEach(([x, z], i) =>
    tree(detail, x, z, 3.8 + (i % 2) * 0.5, i + 10, false));
  parkedBike(detail, 905, 607, -36, "#843e36", "scooter");
  parkedBike(detail, 918, 606, -32, "#475d50", "scooter");
  parkedBike(detail, 905, 676, -30, "#7a644b", "cycle");
  parkedBike(detail, 914, 682, -20, "#735244", "cycle");
  // Place stepped flights at the clear stair bays marked in the plan.
  [
    [602, 770, 0],
    [919, 271, Math.PI / 2],
    [1078, 649, 0],
    [298, 414, 0.2],
  ].forEach(([x, z, yaw]) => {
    const p = sheetPoint(x, z);
    for (let i = 0; i < 19; i++) {
      const height = 0.19 * (i + 1),
        d = (i - 9) * 0.245;
      detail.box(
        "#d2c4ad",
        p.x + Math.sin(yaw) * d,
        0.14 + height / 2,
        p.y + Math.cos(yaw) * d,
        1.22,
        height,
        0.25,
        yaw,
      );
    }
  });
  detail.build(scene);
  const updateFountain = buildEntrance(scene, asphaltMap, stone);
  return { boardOutline, updateFountain, activity: buildMarketActivity(scene, groundUnits, firstUnits) };
}
