import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Parts, levelHeight, prism, type Booking, type Floor, type Unit } from "./geometry";

const trim = "#ecdfca";
const cream = new T.Color("#eee1c9");
const neutral = new T.Color("#ddd3bf");
const available = new T.Color("#91b197");
const booked = new T.Color("#ca7970");

export function numberAtlas() {
  const canvas = document.createElement("canvas");
  const tile = 64;
  canvas.width = canvas.height = 16 * tile;
  const c = canvas.getContext("2d")!;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "bold 30px Arial, sans-serif";
  for (let id = 1; id <= 219; id++) {
    const x = (id % 16) * tile,
      y = Math.floor(id / 16) * tile;
    c.fillStyle = "#233b35";
    c.beginPath();
    c.roundRect(x + 3, y + 15, 58, 34, 6);
    c.fill();
    c.fillStyle = "#fff2ce";
    c.fillText(String(id), x + 32, y + 33);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function entranceDirection(id: number) {
  if (id <= 6 || (id >= 11 && id <= 34)) return [0, -1];
  if (id <= 8) return [-0.4, -1];
  if (id <= 10) return [0.4, -1];
  if (id <= 37) return id === 37 ? [0, -1] : [0, 1];
  if (id <= 44) return [0, 1];
  if (id <= 48) return id === 46 ? [0, -1] : [0, 1];
  if (id <= 62) return [0, 1];
  if (id <= 72) return [-1, 0];
  if (id <= 78) return [1, 0.23];
  if (id <= 91) return [-0.21, 1];
  if (id === 92) return [0.8, 0.68];
  if (id <= 97) return [0.76, 0.65];
  if (id <= 100) return [0.65, -0.76];
  if (id <= 103) return [-0.65, 0.76];
  return [0.65, -0.76];
}

// Use the outward-facing, unobstructed edge of each measured outline as its shopfront.
function frontage(unit: Unit, dx: number, dz: number) {
  const towards = new T.Vector2(dx, dz).normalize();
  const sign = T.ShapeUtils.area(unit.outline) > 0 ? 1 : -1;
  let best = -Infinity,
    result: { mid: T.Vector2; along: T.Vector2; out: T.Vector2; width: number } | undefined;
  unit.outline.forEach((p, i) => {
    const q = unit.outline[(i + 1) % unit.outline.length];
    const along = q.clone().sub(p),
      width = along.length();
    if (width < 0.9) return;
    along.divideScalar(width);
    const out = new T.Vector2(along.y, -along.x).multiplyScalar(sign);
    const alignment = out.dot(towards);
    if (alignment < 0.56) return;
    const mid = p.clone().lerp(q, 0.5);
    const score = alignment * 5 + mid.clone().sub(unit.centre).dot(towards) + Math.min(width, 5) * 0.35;
    if (score > best) {
      best = score;
      result = { mid, along, out, width };
    }
  });
  return result;
}

class Labels {
  points: number[] = [];
  uv: number[] = [];
  add(id: number, a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) {
    const x = (id % 16) / 16,
      y = 1 - Math.floor(id / 16) / 16,
      s = 1 / 16;
    [a, b, d, b, c, d].forEach((p) => this.points.push(p.x, p.y, p.z));
    this.uv.push(x, y - s, x + s, y - s, x, y, x + s, y - s, x + s, y, x, y);
  }
  mesh(atlas: T.Texture) {
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(this.points, 3));
    geom.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    return new T.Mesh(
      geom,
      new T.MeshBasicMaterial({
        map: atlas,
        alphaTest: 0.35,
        side: T.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
  }
}

function facade(
  parts: Parts,
  labels: Labels,
  unit: Unit,
  id: number,
  y: number,
  dx: number,
  dz: number,
  upper: boolean,
) {
  const edge = frontage(unit, dx, dz);
  if (!edge) return;
  const { mid, along, out, width } = edge;
  const yaw = -Math.atan2(along.y, along.x);
  const at = (distance: number, height: number, offset: number) =>
    new T.Vector3(
      mid.x + along.x * distance + out.x * offset,
      y + height,
      mid.y + along.y * distance + out.y * offset,
    );
  function panel(
    c: string,
    distance: number,
    height: number,
    offset: number,
    w: number,
    h: number,
    d: number,
  ) {
    const p = at(distance, height, offset);
    parts.box(c, p.x, p.y, p.z, w, h, d, yaw);
  }
  const bay = Math.max(0.8, width - 0.08);
  panel("#38473e", 0, 1.52, 0.08, bay, 2.83, 0.13);
  panel(id % 5 === 0 ? "#b49b73" : "#889390", 0, 1.5, 0.158, bay - 0.16, 2.45, 0.04);
  panel("#313e37", 0, 1.45, 0.22, 0.065, 2.6, 0.085);
  panel("#cab18b", 0, 2.32, 0.21, bay, 0.065, 0.08);
  panel("#efe4d0", 0, 3.28, 0.25, bay + 0.3, 0.53, 0.8);
  panel("#433e34", 0, 2.92, 0.13, bay - 0.05, 0.31, 0.25);
  panel("#d9bd8b", 0, 2.73, 0.23, Math.max(0.32, bay * 0.72), 0.06, 0.08);
  panel(trim, 0, 0.075, 0.48, bay + 0.3, 0.15, 1.04);
  if (upper) {
    panel("#ded0ba", 0, 0.055, 0.7, bay + 0.35, 0.19, 1.45);
    panel("#81765f", 0, 0.89, 1.35, bay + 0.24, 0.065, 0.07);
    panel("#a99b82", 0, 0.48, 1.35, bay + 0.24, 0.038, 0.045);
    for (const side of [-1, 1]) panel("#796e59", side * bay * 0.45, 0.48, 1.34, 0.055, 0.88, 0.05);
  }
  const sign = Math.max(0.64, Math.min(1.2, bay * 0.68));
  const left = out.x * along.y - out.y * along.x < 0 ? 1 : -1;
  labels.add(
    unit.id,
    at(-left * sign * 0.5, 2.61, 0.291),
    at(left * sign * 0.5, 2.61, 0.291),
    at(left * sign * 0.5, 3.24, 0.291),
    at(-left * sign * 0.5, 3.24, 0.291),
  );
}

export function buildStorey(units: Unit[], floor: Floor, atlas: T.Texture) {
  const upper = floor === "first",
    bottom = upper ? levelHeight + 0.14 : 0.14;
  const pieces = new Parts(),
    labels = new Labels(),
    group = new T.Group();
  const geometries: T.BufferGeometry[] = [],
    ids: number[] = [],
    ranges: { id: number; top: number[] }[] = [];
  let start = 0;
  for (const unit of units) {
    const geom = prism(unit.outline, bottom, levelHeight);
    const normal = geom.getAttribute("normal"),
      colors = new Float32Array(normal.count * 3),
      top: number[] = [];
    for (let i = 0; i < normal.count; i++) {
      const isTop = normal.getY(i) > 0.9;
      (isTop ? neutral : cream).toArray(colors, i * 3);
      if (isTop) top.push(start + i);
      ids.push(unit.id);
    }
    geom.setAttribute("color", new T.BufferAttribute(colors, 3));
    ranges.push({ id: unit.id, top });
    start += normal.count;
    geometries.push(geom);
    const baseId = upper ? unit.id - 111 : unit.id;
    const [dx, dz] = entranceDirection(baseId);
    facade(pieces, labels, unit, baseId, bottom, dx, dz, upper);
    if (baseId >= 38 && baseId <= 44) facade(pieces, labels, unit, baseId, bottom, -dx, -dz, upper);
    const { x, y: z } = unit.centre;
    const w = 1.55,
      h = 1.13,
      level = bottom + levelHeight + 0.028;
    labels.add(
      unit.id,
      new T.Vector3(x - w / 2, level, z + h / 2),
      new T.Vector3(x + w / 2, level, z + h / 2),
      new T.Vector3(x + w / 2, level, z - h / 2),
      new T.Vector3(x - w / 2, level, z - h / 2),
    );
  }
  const geom = mergeGeometries(geometries, false)!;
  geometries.forEach((g) => g.dispose());
  const body = new T.Mesh(geom, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  body.castShadow = body.receiveShadow = true;
  group.add(body, labels.mesh(atlas));
  pieces.build(group);
  return {
    group,
    body,
    units,
    pick(face: T.Face) {
      return ids[face.a];
    },
    color(status: Record<number, Booking>) {
      const attribute = geom.getAttribute("color");
      ranges.forEach(({ id, top }) => {
        const c = status[id] === "booked" ? booked : status[id] === "available" ? available : neutral;
        top.forEach((i) => attribute.setXYZ(i, c.r, c.g, c.b));
      });
      attribute.needsUpdate = true;
    },
  };
}
