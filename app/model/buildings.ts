import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Parts, levelHeight, prism, sheetPoint, type Booking, type Floor, type Unit } from "./geometry";
import { addRetail } from "./retail";
import { addRoofSigns } from "./roofSigns";
import { addRoofTanks } from "./roofTanks";
import { glassSetback } from "./retailFrontages";
import { shellBoundaries, type Boundary } from "./wings";
import { facadeFinish } from "./siteMaterials";
import { buildGalleryStair } from "./galleryStair";
import { pavilionStair, stairRectangle } from "./pavilionStairLayout";
import { addNeonBorder, addShopLanterns } from "./nightLights";

const shades = {
  ...facadeFinish,
  fasciaShadow: "#676560",
};
const available = new T.Color("#88b697");
const booked = new T.Color("#ce756d");
const unreported = new T.Color("#d8d5cb");

function matte(color: string) {
  return new T.MeshStandardMaterial({ color, roughness: 0.85, side: T.DoubleSide });
}

// A seamless, uniformly scaled square roof tile. UVs use architectural metres on every wing.
function roofFinish() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const joint = x % 32 === 0 || y % 32 === 0;
      const bevel = x % 32 === 1 || y % 32 === 1;
      const grain = ((x * 89 + y * 151 + x * y * 29) % 11) / 3 - 1.8;
      const tile = (Math.floor(x / 32) * 7 + Math.floor(y / 32) * 11) % 5 - 2;
      const tone = Math.round(grain + tile + (joint ? -29 : bevel ? 3 : 0));
      const i = (y * size + x) * 4;
      data[i] = 230 + tone;
      data[i + 1] = 224 + tone;
      data[i + 2] = 211 + tone;
      data[i + 3] = 255;
    }
  }
  const texture = new T.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(0.55, 0.55);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = T.SRGBColorSpace;
  texture.needsUpdate = true;
  return new T.MeshStandardMaterial({ map: texture, roughness: 0.94 });
}

class Surface {
  vertices: number[] = [];
  quad(a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) {
    const corners = [a, b, c, a, c, d];
    corners.forEach(p => this.vertices.push(p.x, p.y, p.z));
  }
  build(parent: T.Group, material: T.MeshStandardMaterial, shadows: boolean) {
    if (!this.vertices.length) return;
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(this.vertices, 3));
    geom.computeVertexNormals();
    const mesh = new T.Mesh(geom, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function at(p: T.Vector2, h: number) {
  return new T.Vector3(p.x, h, p.y);
}

function inset(wing: Boundary, index: number, distance: number) {
  return wing.points[index].clone().addScaledVector(wing.insets[index], distance);
}

function drawShells(group: T.Group, upper: boolean, bottom: number, deck: number) {
  const walls = new Surface();
  const soffits = new Surface();
  const coping = new Surface();
  const reveals = new Surface();
  const details = new Parts();
  const piers: T.Vector2[] = [];
  const plaster = matte(shades.plaster);
  const fascia = matte(shades.edge);
  const graphite = matte(shades.coping);
  const tiled = roofFinish();
  const recess = upper ? glassSetback.first : glassSetback.ground;
  const low = bottom + 0.14;
  const high = deck - (upper ? 0.73 : 0.55);
  const parapet = deck + (upper ? 0.40 : 0.48);

  function plate(contour: T.Vector2[], base: number, depth: number, roof: boolean, openings?: T.Vector2[][]) {
    const mesh = new T.Mesh(prism(contour, base, depth, openings), roof ? [tiled, fascia] : plaster);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const wing of shellBoundaries) {
    const points = wing.points;
    // Long straight runs need regular facade bays, but only their endpoints belong in a roof triangulation.
    const roofCorners = points.filter((p, i) => {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[(i + 1) % points.length];
      const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
      return Math.abs(cross) > 1e-8;
    });
    if (!upper) plate(roofCorners, bottom, low - bottom, false);
    const openings = !upper && wing === shellBoundaries[2]
      ? [stairRectangle(pavilionStair.firstTread, pavilionStair.back - .10, .10)] : undefined;
    plate(roofCorners, high, deck - high, true, openings);

    let distance = 0;
    let nextPier = 0;
    const inside = points.map((_, i) => inset(wing, i, recess));
    const count = points.length;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const a = points[i];
      const b = points[j];
      const ai = inside[i];
      const bi = inside[j];
      const direction = b.clone().sub(a);
      const length = direction.length();
      direction.divideScalar(length);
      const yaw = -Math.atan2(direction.y, direction.x);

      // An actual upstand, narrow metal coping and recessed drip line read at courtyard scale.
      const p = inset(wing, i, 0.18);
      const q = inset(wing, j, 0.18);
      if (upper || wing.publicEdge[i]) {
        walls.quad(at(a, deck), at(b, deck), at(b, parapet - 0.075), at(a, parapet - 0.075));
        walls.quad(at(q, deck), at(p, deck), at(p, parapet - 0.075), at(q, parapet - 0.075));
        coping.quad(at(a, parapet - 0.075), at(b, parapet - 0.075), at(b, parapet), at(a, parapet));
        coping.quad(at(q, parapet - 0.075), at(p, parapet - 0.075), at(p, parapet), at(q, parapet));
        coping.quad(at(a, parapet), at(b, parapet), at(q, parapet), at(p, parapet));
      }

      if (wing.publicEdge[i]) {
        reveals.quad(at(a, high - 0.07), at(b, high - 0.07), at(b, high), at(a, high));
        soffits.quad(at(a, high), at(b, high), at(bi, high), at(ai, high));
        // The tiled balcony below belongs to the lower storey. Provide the same walking surface at street level.
        if (!upper) soffits.quad(at(ai, low + 0.012), at(bi, low + 0.012), at(b, low + 0.012), at(a, low + 0.012));

        if (!wing.publicEdge[(i + count - 1) % count]) {
          nextPier = distance + 0.5;
        }
        const place = (offset: number, setback: number) => {
          const t = (offset - distance) / length;
          const out = a.clone().lerp(b, t);
          return out.addScaledVector(wing.insets[i].clone().lerp(wing.insets[j], t), setback);
        };
        while (nextPier <= distance + length) {
          const anchor = place(nextPier, 0.34);
          piers.push(anchor);
          const width = upper ? 0.22 : 0.40;
          details.box(shades.plaster, anchor.x, (low + high) / 2, anchor.y, width, high - low, upper ? 0.32 : 0.47, yaw);
          nextPier += 3.35;
        }
      } else {
        const foot = upper ? bottom : low;
        walls.quad(at(a, foot), at(b, foot), at(b, high), at(a, high));
      }
      if (wing.publicEdge[i] !== wing.publicEdge[j]) {
        walls.quad(at(b, low), at(bi, low), at(bi, high), at(b, high));
      }
      distance += length;
    }
  }
  walls.build(group, plaster, true);
  // The ceiling lining is coplanar with the underside of the slab above it, so it is drawn in front.
  const lining = matte(shades.lining);
  lining.polygonOffset = true;
  lining.polygonOffsetFactor = lining.polygonOffsetUnits = -1;
  soffits.build(group, lining, false);
  coping.build(group, graphite, true);
  reveals.build(group, matte(shades.fasciaShadow), false);
  if (upper) {
    // Access headhouses sit above the marked stair bays; their low tiled caps share the roof finish.
    const headhouses = [
      [599, 794, 4.15, 3.08, 0],
      [917, 267, 3.8, 2.9, 0],
      [1081, 650, 4.35, 3.2, 0],
      [1374, 702, 3.7, 3.12, 0],
      [294, 419, 3.05, 2.95, -0.195],
      [706, 486, 3.05, 2.65, -0.21],
      [149, 626, 3.45, 2.8, -0.7],
    ].map(([x, z, width, depth, yaw]) => ({ centre: sheetPoint(x, z), width, depth, yaw }));
    const height = 1.65;
    const capBottom = deck + height + 0.031, capDepth = 0.025;
    for (const { centre, width, depth, yaw } of headhouses) {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const corners = (w: number, d: number) => [
        [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
      ].map(([u, v]) => new T.Vector2(centre.x + cos * u + sin * v, centre.y - sin * u + cos * v));
      details.box(shades.plaster, centre.x, deck + height / 2, centre.y, width, height, depth, yaw);
      const doorway = corners(0, depth + 0.045)[2];
      details.box("#65615b", doorway.x, deck + 0.64, doorway.y, 0.80, 1.28, 0.055, yaw);
      const lip = new T.Mesh(prism(corners(width + 0.22, depth + 0.22), deck + height - 0.085, 0.115), graphite);
      lip.castShadow = lip.receiveShadow = true;
      group.add(lip);
      plate(corners(width - 0.07, depth - 0.07), capBottom, capDepth, true);
    }
    addRoofTanks(group, headhouses, capBottom + capDepth);
  }
  details.build(group);
  return { soffit: high, walkway: upper ? bottom : low + 0.012, parapet, piers };
}

export function buildStorey(units: Unit[], floor: Floor, onMaterialsReady?: () => void) {
  const upper = floor === "first";
  const bottom = (upper ? levelHeight : 0) + 0.14;
  const deck = bottom + levelHeight;
  const group = new T.Group();
  const shell = drawShells(group, upper, bottom, deck);
  if (upper) {
    addRoofSigns(group, units, deck);
    addNeonBorder(group, shell.parapet);
  }
  buildGalleryStair(group, floor);
  const updateDoors = addRetail(group, units, floor, onMaterialsReady);
  addShopLanterns(group, units, floor, shell.soffit, shell.walkway);

  // Preserve the actual measured unit polygons as pick targets and optional availability overlays.
  const volumes: T.BufferGeometry[] = [];
  const patches: T.BufferGeometry[] = [];
  const ids: number[] = [];
  const ranges: { id: number; start: number; count: number }[] = [];
  let offset = 0;
  for (const unit of units) {
    const volume = prism(unit.outline, bottom, levelHeight);
    for (let i = 0; i < volume.getAttribute("position").count; i++) ids.push(unit.id);
    volumes.push(volume);
    const patch = new T.ShapeGeometry(new T.Shape(unit.outline.map(p => new T.Vector2(p.x, -p.y)))).toNonIndexed();
    patch.rotateX(-Math.PI / 2);
    patch.translate(0, deck + 0.04, 0);
    const count = patch.getAttribute("position").count;
    ranges.push({ id: unit.id, start: offset, count });
    offset += count;
    patches.push(patch);
  }

  const body = new T.Mesh(mergeGeometries(volumes)!, new T.MeshBasicMaterial({ visible: false }));
  const patchGeometry = mergeGeometries(patches)!;
  const colors = new T.Float32BufferAttribute(new Float32Array(offset * 3), 3);
  colors.setUsage(T.DynamicDrawUsage);
  patchGeometry.setAttribute("color", colors);
  const overlay = new T.Mesh(patchGeometry, new T.MeshBasicMaterial({
    vertexColors: true, side: T.DoubleSide, transparent: true, opacity: 0.80,
    polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false,
  }));
  overlay.visible = false;
  group.add(body, overlay);
  volumes.forEach(g => g.dispose());
  patches.forEach(g => g.dispose());
  return {
    group,
    updateDoors,
    body,
    units,
    piers: shell.piers,
    pick(face: T.Face) { return ids[face.a]; },
    setAvailabilityVisible(show: boolean) { overlay.visible = show; },
    color(status: Record<number, Booking>) {
      ranges.forEach(({ id, start, count }) => {
        const c = status[id] === "booked" ? booked : status[id] === "available" ? available : unreported;
        for (let i = start; i < start + count; i++) colors.setXYZ(i, c.r, c.g, c.b);
      });
      colors.needsUpdate = true;
    },
  };
}
