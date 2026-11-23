import * as T from "three";
import { Parts, sheetPoint } from "./geometry";

function surface(shape: T.Shape, color: string, thickness: number, y: number, texture?: T.Texture) {
  const geometry = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 18 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const top = new T.MeshStandardMaterial({ color, roughness: 0.94, map: texture ?? null });
  const side = new T.MeshStandardMaterial({
    color: new T.Color(color).multiplyScalar(0.85),
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
function paverTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#a89d89";
  c.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++)
    for (let col = -1; col < 5; col++) {
      const v = 221 + ((row * 7 + col * 3 + 19) % 9);
      c.fillStyle = "rgb(" + v + "," + (v - 6) + "," + (v - 18) + ")";
      c.fillRect(col * 64 + (row % 2) * 32 + 1, row * 32 + 1, 63, 31);
    }
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(0.22, 0.22);
  return t;
}

function sunburst() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!,
    center = 256;
  c.fillStyle = "#dccaab";
  c.fillRect(0, 0, 512, 512);
  function circle(r: number, fill: string) {
    c.beginPath();
    c.arc(center, center, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
  }
  circle(254, "#705744");
  circle(247, "#e2c58f");
  circle(237, "#8c7052");
  circle(229, "#eee3ca");
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16,
      b = a + Math.PI / 32;
    c.beginPath();
    c.moveTo(center + Math.sin(a) * 224, center + Math.cos(a) * 224);
    c.lineTo(center + Math.sin(b) * 210, center + Math.cos(b) * 210);
    c.lineTo(center + Math.sin(a + Math.PI / 16) * 224, center + Math.cos(a + Math.PI / 16) * 224);
    c.fillStyle = "#a78256";
    c.fill();
  }
  circle(174, "#aa8253");
  circle(168, "#eee2c6");
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      r = i % 2 ? 102 : 152;
    const tip = [center + Math.sin(a) * r, center + Math.cos(a) * r];
    for (const side of [-1, 1]) {
      const b = a + (side * Math.PI) / 16;
      c.beginPath();
      c.moveTo(center, center);
      c.lineTo(tip[0], tip[1]);
      c.lineTo(center + Math.sin(b) * 34, center + Math.cos(b) * 34);
      c.closePath();
      c.fillStyle = side === 1 ? "#40504a" : "#a7855d";
      c.fill();
    }
  }
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
}
function tree(parts: Parts, px: number, pz: number, size: number, seed: number, planter: boolean) {
  const { x, y: z } = sheetPoint(px, pz);
  const base = planter ? 0.13 : -0.27;
  if (planter) {
    parts.add("pole", "#b39772", new T.Vector3(x, 0.135, z), new T.Vector3(1.9, 0.12, 1.9));
    parts.add("pole", "#766d4c", new T.Vector3(x, 0.205, z), new T.Vector3(1.65, 0.04, 1.65));
  }
  const v = (dx: number, y: number, dz: number) =>
    new T.Vector3(x + dx * size, base + y * size, z + dz * size);
  parts.rod("#706345", v(0, 0, 0), v(0.04, 0.7, 0), 0.047 * size);
  const palette = ["#637944", "#879151", "#a0a259", "#708849", "#849556"];
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

function vehicle(
  parts: Parts,
  px: number,
  pz: number,
  heading: number,
  color: string,
  kind: "car" | "scooter" | "cycle",
) {
  const { x, y: z } = sheetPoint(px, pz),
    yaw = (heading * Math.PI) / 180,
    unitQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const at = (dx: number, y: number, dz: number) =>
    new T.Vector3(dx, y, dz).applyQuaternion(unitQ).add(new T.Vector3(x, 0.15, z));
  function box(c: string, dx: number, y: number, dz: number, w: number, h: number, l: number) {
    const p = at(dx, y, dz);
    parts.box(c, p.x, p.y, p.z, w, h, l, yaw);
  }
  function ball(c: string, dx: number, y: number, dz: number, w: number, h: number, l: number) {
    parts.add("round", c, at(dx, y, dz), new T.Vector3(w, h, l), unitQ);
  }
  const wheelQ = unitQ
    .clone()
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2));
  if (kind === "car") {
    box("#373f3b", 0, 0.48, 0, 1.65, 0.43, 3.76);
    ball(color, 0, 0.76, 0, 1.88, 1.0, 4.42);
    box(color, 0, 0.77, 0, 1.75, 0.48, 3.74);
    ball("#516360", 0, 1.04, -0.15, 1.57, 1.07, 2.6);
    ball(color, 0, 1.46, -0.18, 1.42, 0.24, 1.78);
    box(color, 0, 1, 1.36, 1.52, 0.14, 0.76);
    for (const side of [-1, 1]) {
      box("#6f756c", side * 0.76, 1.13, 0.03, 0.065, 0.36, 0.085);
      box("#dfd8b3", side * 0.62, 0.8, 1.91, 0.37, 0.14, 0.06);
      box("#a44c37", side * 0.64, 0.84, -1.93, 0.33, 0.16, 0.06);
      ball(color, side * 0.92, 1.05, 0.5, 0.23, 0.16, 0.23);
      for (const wh of [-1.28, 1.23]) {
        parts.add("pole", "#292e2c", at(side * 0.79, 0.37, wh), new T.Vector3(0.66, 0.22, 0.66), wheelQ);
        parts.add("pole", "#9a9b8d", at(side * 0.91, 0.37, wh), new T.Vector3(0.36, 0.028, 0.36), wheelQ);
      }
    }
  } else {
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
}

function pedestrian(parts: Parts, px: number, pz: number, angle: number, i: number) {
  const { x, y: z } = sheetPoint(px, pz),
    yaw = (angle * Math.PI) / 180,
    q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const v = (dx: number, y: number, dz: number) =>
    new T.Vector3(dx, y, dz).applyQuaternion(q).add(new T.Vector3(x, 0.12, z));
  const shirt = ["#a25c3f", "#e3d7b8", "#65796d", "#6e8291", "#aa885e", "#7c5660"][i % 6];
  const skin = ["#a97752", "#966c4c", "#ce9e76", "#815a44"][i % 4];
  const leg = i % 3 ? "#4e5048" : "#807b69";
  for (const side of [-1, 1]) {
    const dz = side * 0.13;
    parts.rod(leg, v(side * 0.095, 0.87, 0), v(side * 0.11, 0.4, dz * 0.5), 0.082);
    parts.rod(leg, v(side * 0.11, 0.41, dz * 0.5), v(side * 0.12, 0.11, dz), 0.064);
    parts.add("round", "#443e34", v(side * 0.12, 0.08, dz + 0.045), new T.Vector3(0.16, 0.12, 0.27), q);
    parts.rod(shirt, v(side * 0.15, 1.34, 0), v(side * 0.22, 1.08, -dz * 0.4), 0.069);
    parts.rod(skin, v(side * 0.22, 1.08, -dz * 0.4), v(side * 0.24, 0.9, -dz), 0.049);
  }
  parts.add("round", shirt, v(0, 1.11, 0), new T.Vector3(0.43, 0.65, 0.3), q);
  parts.add("round", skin, v(0, 1.57, 0), new T.Vector3(0.245, 0.315, 0.24), q);
  parts.add("round", "#473b30", v(0, 1.655, -0.014), new T.Vector3(0.25, 0.17, 0.245), q);
  if (i % 3 === 0) {
    const p = v(0.245, 0.7, -0.08);
    parts.box("#bc9a6a", p.x, p.y, p.z, 0.15, 0.27, 0.24, yaw);
  }
}

export function buildMarket(scene: T.Scene) {
  // The island and curved carriageway follow the ground drawing; surface materials follow the renders.
  const plinth = new SiteShape();
  plinth
    .move(74, 620)
    .line(166, 417)
    .line(193, 354)
    .line(673, 450)
    .line(746, 120)
    .line(966, 132)
    .line(966, 455)
    .line(1368, 455)
    .line(1453, 841)
    .line(1389, 852)
    .line(382, 850)
    .line(246, 784)
    .closePath();
  scene.add(surface(plinth, "#bbc09e", 0.85, -1.05));
  const site = new SiteShape();
  site
    .move(101, 615)
    .line(169, 460)
    .line(196, 471)
    .line(216, 379)
    .line(684, 476)
    .line(725, 293)
    .line(764, 302)
    .line(793, 150)
    .line(944, 160)
    .line(944, 478)
    .line(1346, 479)
    .line(1420, 824)
    .line(1389, 828)
    .line(1388, 821)
    .line(922, 823)
    .line(674, 826)
    .line(388, 818)
    .line(258, 755)
    .closePath();
  scene.add(surface(site, "#e8deca", 0.28, -0.17, paverTexture()));
  const road = new SiteShape();
  road
    .move(287, 768)
    .curve(294, 698, 315, 639, 365, 593)
    .curve(416, 541, 481, 518, 552, 523)
    .line(629, 538)
    .curve(708, 553, 766, 501, 779, 424)
    .curve(783, 400, 783, 378, 783, 352)
    .line(783, 194)
    .line(793, 151)
    .line(875, 156)
    .line(875, 416)
    .curve(875, 536, 788, 626, 668, 629)
    .line(548, 629)
    .curve(467, 629, 411, 671, 395, 753)
    .line(388, 817)
    .closePath();
  scene.add(surface(road, "#565a51", 0.036, 0.114));
  const detail = new Parts();
  const med = sheetPoint(828, 650);
  const disc = new T.Mesh(new T.CircleGeometry(5.85, 72), sunburst());
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(med.x, 0.125, med.y);
  scene.add(disc);
  // Crossings face along the movement of pedestrians across the internal drive.
  for (let n = 0; n < 7; n++) {
    const p = sheetPoint(646, 548 + n * 10.5);
    detail.box("#d3cec0", p.x, 0.157, p.y, 1.62, 0.012, 0.72);
  }
  [
    [599, 653],
    [704, 657],
    [875, 714],
    [952, 719],
    [1207, 715],
    [1177, 595],
    [915, 584],
    [845, 528],
  ].forEach(([x, z], i) => tree(detail, x, z, 3.7 + (i % 3) * 0.43, i, true));
  const trees = [
    [92, 601],
    [141, 505],
    [203, 400],
    [244, 376],
    [324, 390],
    [401, 403],
    [478, 422],
    [557, 435],
    [638, 449],
    [716, 343],
    [753, 204],
    [913, 145],
    [947, 238],
    [944, 340],
    [958, 466],
    [1029, 470],
    [1108, 465],
    [1190, 462],
    [1280, 465],
    [1358, 496],
    [1386, 607],
    [1403, 685],
    [1418, 796],
    [1260, 833],
    [1124, 834],
    [1000, 835],
    [848, 836],
    [723, 841],
    [579, 831],
    [480, 830],
    [337, 807],
    [237, 764],
    [172, 703],
  ];
  trees.forEach(([x, z], i) => tree(detail, x, z, 4.4 + ((i * 7) % 11) * 0.15, i + 17, false));
  const cars: [number, number, number, string][] = [
    [343, 721, 160, "#ded5c1"],
    [489, 573, 95, "#9d604a"],
    [709, 584, 108, "#dedacf"],
    [837, 399, 178, "#65736d"],
    [825, 277, -3, "#ccc0a3"],
  ];
  cars.forEach(([x, z, heading, color]) => vehicle(detail, x, z, heading, color, "car"));
  vehicle(detail, 601, 595, 92, "#935443", "scooter");
  vehicle(detail, 382, 669, -19, "#475d50", "scooter");
  vehicle(detail, 881, 673, -30, "#7a644b", "cycle");
  vehicle(detail, 915, 687, -20, "#735244", "cycle");
  const people = [
    [571, 664],
    [577, 666],
    [718, 683],
    [731, 691],
    [779, 695],
    [834, 703],
    [844, 705],
    [883, 622],
    [919, 605],
    [958, 588],
    [1008, 589],
    [1035, 706],
    [1040, 704],
    [1155, 695],
    [1192, 704],
    [1211, 585],
    [1230, 602],
    [688, 556],
    [681, 551],
    [603, 534],
    [446, 501],
    [459, 504],
    [408, 727],
    [465, 736],
    [795, 450],
    [867, 417],
    [201, 581],
    [319, 661],
  ];
  people.forEach(([x, z], i) => pedestrian(detail, x, z, (i * 73) % 360, i));
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
}
