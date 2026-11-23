import * as T from "three";

export type Floor = "ground" | "first";
export type Booking = "available" | "booked";
export type Unit = { id: number; outline: T.Vector2[]; centre: T.Vector2 };
export const levelHeight = 3.65;

// One point on the 1:150 PDF represents 150/72 inches on site.
const metresPerPoint = (150 * 0.0254) / 72;
export function paperPoint(x: number, y: number) {
  return new T.Vector2((x - 1642) * metresPerPoint, (y - 1060) * metresPerPoint);
}
// Landscaping control points use the 1550-pixel reference image of the 3370.39-point sheet.
export function sheetPoint(x: number, y: number) {
  return paperPoint((x * 3370.39) / 1550, (y * 3370.39) / 1550);
}

export async function readFloor(floor: Floor, signal: AbortSignal) {
  const res = await fetch("/plans/" + floor + ".svg", { signal });
  if (!res.ok) throw new Error("The floor drawing could not be loaded.");
  const root = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const units = Array.from(root.querySelectorAll("[data-shop]"), (group) => {
    const path = group.querySelector(".nb-unit")?.getAttribute("d") ?? "";
    if (!/^M[-+\d.\sL]+Z$/.test(path)) throw new Error("Unrecognised shop outline.");
    const numbers = path.match(/[-+]?\d*\.?\d+/g)!.map(Number);
    const outline: T.Vector2[] = [];
    for (let i = 0; i < numbers.length; i += 2) {
      const point = paperPoint(numbers[i], numbers[i + 1]);
      if (!outline.length || outline[outline.length - 1].distanceToSquared(point) > 0.000025)
        outline.push(point);
    }
    const label = group
      .querySelector("path + g")
      ?.getAttribute("transform")
      ?.match(/[-+]?\d*\.?\d+/g);
    const centre =
      label?.length === 2
        ? paperPoint(Number(label[0]), Number(label[1]))
        : outline.reduce((sum, point) => sum.add(point), new T.Vector2()).divideScalar(outline.length);
    return { id: Number(group.getAttribute("data-shop")), outline, centre };
  });
  if (units.length !== 108) throw new Error("The complete floor drawing is required.");
  return units;
}

export function prism(points: T.Vector2[], bottom: number, height: number, holes: T.Vector2[][] = []) {
  const shape = new T.Shape(points.map((p) => new T.Vector2(p.x, -p.y)));
  shape.holes = holes.map(ring => new T.Path(ring.map(p => new T.Vector2(p.x, -p.y))));
  const geom = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 2 });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, bottom, 0);
  return geom;
}

const primitives = {
  box: () => new T.BoxGeometry(1, 1, 1),
  round: () => new T.SphereGeometry(0.5, 12, 8),
  crown: () => new T.IcosahedronGeometry(0.55, 1),
  pole: () => new T.CylinderGeometry(0.5, 0.5, 1, 10),
  ring: () => new T.TorusGeometry(0.46, 0.055, 6, 22),
};
type Primitive = keyof typeof primitives;
type Piece = { matrix: T.Matrix4; color: T.Color };
const up = new T.Vector3(0, 1, 0);
const scratch = new T.Object3D();

/** Instance repeated building details and street furniture by primitive shape. */
export class Parts {
  private entries = new Map<Primitive, Piece[]>();
  add(
    shape: Primitive,
    color: string,
    position: T.Vector3,
    scale: T.Vector3,
    rotation: T.Quaternion = new T.Quaternion(),
  ) {
    scratch.position.copy(position);
    scratch.scale.copy(scale);
    scratch.quaternion.copy(rotation);
    scratch.updateMatrix();
    const pile = this.entries.get(shape) ?? [];
    pile.push({ matrix: scratch.matrix.clone(), color: new T.Color(color) });
    this.entries.set(shape, pile);
  }
  box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
    this.add(
      "box",
      color,
      new T.Vector3(x, y, z),
      new T.Vector3(sx, sy, sz),
      new T.Quaternion().setFromAxisAngle(up, yaw),
    );
  }
  rod(color: string, a: T.Vector3, b: T.Vector3, radius: number) {
    const delta = b.clone().sub(a);
    const scale = new T.Vector3(radius * 2, delta.length(), radius * 2);
    this.add(
      "pole",
      color,
      a.clone().lerp(b, 0.5),
      scale,
      new T.Quaternion().setFromUnitVectors(up, delta.normalize()),
    );
  }
  build(group: T.Object3D) {
    const material = new T.MeshStandardMaterial({ roughness: 0.72, metalness: 0.07 });
    for (const [shape, pile] of this.entries) {
      const mesh = new T.InstancedMesh(primitives[shape](), material, pile.length);
      pile.forEach((p, i) => {
        mesh.setMatrixAt(i, p.matrix);
        mesh.setColorAt(i, p.color);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.entries.clear();
  }
}

export function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  scene.traverse((obj) => {
    if (!(obj instanceof T.Mesh)) return;
    geometries.add(obj.geometry);
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      materials.add(mat);
      if (mat.map) textures.add(mat.map);
    }
    if (obj instanceof T.InstancedMesh) obj.dispose();
  });
  textures.forEach((v) => v.dispose());
  materials.forEach((v) => v.dispose());
  geometries.forEach((v) => v.dispose());
}
