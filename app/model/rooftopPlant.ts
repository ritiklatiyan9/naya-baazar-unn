import * as T from "three";
import { Parts } from "./geometry";
import { sunDirection } from "./realism";
import { shellBoundaries } from "./wings";

function segmentDistance(p: T.Vector2, a: T.Vector2, b: T.Vector2) {
  const ab = b.clone().sub(a), t = T.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

function contains(p: T.Vector2, ring: T.Vector2[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/**
 * Split-AC condensers and small solar arrays along the back parapets of the roof,
 * clear of the gallery edge, the stair headhouses and their tanks.
 */
export function addRooftopPlant(group: T.Group, roof: number, headhouses: T.Vector2[]) {
  const units = new Parts(), arrays = new Parts(), frames = new Parts();
  let seed = 977;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  // Panels face the afternoon sun's azimuth at a 15° tilt, whatever the wing's own direction.
  const facing = Math.atan2(sunDirection.x, sunDirection.z), tilt = .26;
  const across = new T.Vector2(Math.cos(facing), -Math.sin(facing)), toward = new T.Vector2(Math.sin(facing), Math.cos(facing));
  const panelTurn = new T.Quaternion().setFromEuler(new T.Euler(tilt, facing, 0, "YXZ"));
  for (const { points, publicEdge, insets } of shellBoundaries) {
    const edges = points.map((a, i) => ({ a, b: points[(i + 1) % points.length], open: publicEdge[i] }));
    const clearance = (p: T.Vector2, openOnly = false) =>
      Math.min(...edges.filter(e => !openOnly || e.open).map(e => segmentDistance(p, e.a, e.b)));
    const free = (p: T.Vector2, radius: number) => headhouses.every(h => h.distanceTo(p) > radius);
    let run = 0, next = 3 + rand() * 3;
    for (let i = 0; i < points.length; i++) {
      if (publicEdge[i]) continue;
      const a = points[i], b = points[(i + 1) % points.length], length = a.distanceTo(b);
      const direction = b.clone().sub(a).divideScalar(length), yaw = -Math.atan2(direction.y, direction.x);
      for (; next < run + length; next += 6.5 + rand() * 3) {
        const t = (next - run) / length;
        const edge = a.clone().lerp(b, t);
        const inward = insets[i].clone().lerp(insets[(i + 1) % points.length], t).normalize();
        const pick = rand();
        if (pick < .3) {
          // A 2 × 4 array of 1 × 1.65 m modules on a raked aluminium frame.
          const centre = edge.clone().addScaledVector(inward, 4.8);
          const footprint = [[-2.3, -2.1], [2.3, -2.1], [2.3, 2.1], [-2.3, 2.1]].map(([x, z]) =>
            centre.clone().addScaledVector(across, x).addScaledVector(toward, z));
          if (footprint.some(p => !contains(p, points) || clearance(p) < .9) || clearance(centre, true) < 4 || !free(centre, 5)) continue;
          for (const row of [-1, 1]) for (let k = 0; k < 4; k++) {
            const p = centre.clone().addScaledVector(across, (k - 1.5) * 1.06).addScaledVector(toward, row * 1.05);
            const y = roof + .48;
            arrays.add("box", "#1c2a44", new T.Vector3(p.x, y + .02, p.y), new T.Vector3(1, .035, 1.65), panelTurn);
            frames.add("box", "#b4b9bc", new T.Vector3(p.x, y, p.y), new T.Vector3(1.03, .03, 1.68), panelTurn);
            for (const end of [-1, 1]) {
              const foot = p.clone().addScaledVector(toward, end * .7);
              const height = .48 - end * .7 * Math.sin(tilt);
              frames.rod("#9aa0a3", new T.Vector3(foot.x, roof + .04, foot.y), new T.Vector3(foot.x, roof + height, foot.y), .022);
            }
          }
          frames.box("#8d8f8c", centre.x, roof + .03, centre.y, 4.5, .06, .18, facing);
        } else if (pick < .85) {
          // Outdoor condenser on a galvanised stand, its fan grille facing across the roof.
          const centre = edge.clone().addScaledVector(inward, 1.25);
          if (clearance(centre, true) < 2.5 || !free(centre, 3.4)) continue;
          const y = roof + .1 + .31;
          units.box("#dedfd9", centre.x, y, centre.y, .86, .62, .32, yaw);
          units.box("#c9cbc5", centre.x, y + .325, centre.y, .88, .03, .34, yaw);
          for (const side of [-1, 1]) {
            const leg = centre.clone().addScaledVector(direction, side * .33);
            units.box("#7d8384", leg.x, roof + .05, leg.y, .05, .1, .42, yaw);
          }
          const face = centre.clone().addScaledVector(inward, .16), grille = centre.clone().addScaledVector(inward, .172);
          const fan = face.clone().addScaledVector(direction, -.12);
          units.rod("#2f3335", new T.Vector3(fan.x, y, fan.y), new T.Vector3(grille.x - direction.x * .12, y, grille.y - direction.y * .12), .225);
          // Refrigerant lines drop over the parapet towards the shop below.
          const pipe = centre.clone().addScaledVector(direction, .36).addScaledVector(inward, -.05);
          const lip = edge.clone().addScaledVector(direction, (.36));
          units.rod("#e8e6df", new T.Vector3(pipe.x, y - .1, pipe.y), new T.Vector3(lip.x, roof + .32, lip.y), .028);
        }
      }
      run += length;
    }
  }
  const plant = new T.Group();
  plant.name = "Rooftop plant";
  units.build(plant, new T.MeshStandardMaterial({ roughness: .48, metalness: .18 }));
  arrays.build(plant, new T.MeshStandardMaterial({ roughness: .16, metalness: .4 }));
  frames.build(plant, new T.MeshStandardMaterial({ roughness: .35, metalness: .7 }));
  group.add(plant);
}
