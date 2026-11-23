import * as T from "three";
import type { Floor, Unit } from "./geometry";
import type { Boundary } from "./wings";
import { pavilionStair, pavilionStairShops } from "./pavilionStairLayout";

export const glassSetback = { ground: 1.72, first: 1.9 };
export const shopFloorHeight = { ground: 0.29, first: 3.82 };
export const displayDepth = 2.37;
// Rooms run this deep wherever the building behind the glass allows; the rest keep the display depth.
const deepRoom = 3.8;
export const displayCount = (width: number) => Math.ceil(width / 3);
export const shelfWidth = (span: number) => Math.min(2.02, span * .78);

export function shopEntrance(width: number) {
  return { center: width < 2.6 ? 0 : -Math.min(0.81, width * 0.16), halfWidth: Math.min(0.51, width * 0.31) };
}

type Frontage = {
  width: number;
  /** Along the fascia from the centre of the entrance bay; positive inset goes towards the shop. */
  at: (along: number, inset: number) => T.Vector2;
};
export type RetailBay = Frontage & {
  id: number;
  /** Room depth behind the glass. Furnishings sit against the rear wall, so they move back with it. */
  depth: number;
  shop?: Frontage & { galleryAt: (along: number) => number };
};

function contains(point: T.Vector2, ring: T.Vector2[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Nearest side boundary across the entire depth of a front-facing rectangular room.
// Clipping the polygon edges also accounts for re-entrant jambs in the floor drawing.
function roomHalfWidth(ring: T.Vector2[], front: T.Vector2, tangent: T.Vector2, inward: T.Vector2, near: number, far: number) {
  let radius = Infinity;
  const last = ring[ring.length - 1].clone().sub(front);
  let x0 = last.dot(tangent), z0 = last.dot(inward);
  for (const vertex of ring) {
    const dx = vertex.x - front.x, dy = vertex.y - front.y;
    const x1 = dx*tangent.x + dy*tangent.y, z1 = dx*inward.x + dy*inward.y;
    if (Math.min(z0,z1) <= far && Math.max(z0,z1) >= near) {
      const t0 = Math.abs(z1-z0) < 1e-9 ? 0 : T.MathUtils.clamp((near-z0)/(z1-z0),0,1);
      const t1 = Math.abs(z1-z0) < 1e-9 ? 1 : T.MathUtils.clamp((far-z0)/(z1-z0),0,1);
      const a = T.MathUtils.lerp(x0,x1,t0), b = T.MathUtils.lerp(x0,x1,t1);
      radius = Math.min(radius, a*b <= 0 ? 0 : Math.min(Math.abs(a),Math.abs(b)));
    }
    x0 = x1; z0 = z1;
  }
  return radius;
}

// A wraparound gallery can be much wider than its end shop. Find a straight display room
// with its full depth inside both the surveyed unit and the shell, opening onto that gallery.
function fitEndShop(bay: RetailBay, wing: Boundary, unit: Unit, floor: Floor, neighbours: Unit[] = []) {
  const glass = glassSetback[floor], half = bay.width / 2;
  const samples = Math.ceil(bay.width / .22);
  const stations = Array.from({length: samples + 1}, (_, i) => -half + i * bay.width / samples);
  const allowed = neighbours.length
    ? (p: T.Vector2) => neighbours.every(other => !contains(p, other.outline))
    : (p: T.Vector2) => contains(p, wing.points);
  const wallsFit = stations.every(u => [0, displayDepth / 2, displayDepth + .08]
    .every(depth => allowed(bay.at(u, glass + depth))));
  const displays = displayCount(bay.width), span = bay.width / displays;
  const displaysFit = wallsFit && Array.from({length: displays}, (_, i) => {
    const u = -half + (i + .5)*span, centre = bay.at(u, glass+1.96);
    const tangent = bay.at(u+.16,glass).sub(bay.at(u-.16,glass)).normalize();
    const normal = new T.Vector2(-tangent.y,tangent.x);
    const halfShelf = (shelfWidth(span) + .10) / 2;
    return [-1,1].every(side => [-.40,.40].every(depth => allowed(
      centre.clone().addScaledVector(tangent,side*halfShelf).addScaledVector(normal,depth))));
  }).every(Boolean);
  if (displaysFit) return;

  const margin = .14, near = -.26, far = displayDepth + margin;
  const edges = unit.outline.map((p, i) => unit.outline[(i + 1) % unit.outline.length].clone().sub(p));
  const axis = edges.reduce((longest, edge) => edge.lengthSq() > longest.lengthSq() ? edge : longest).normalize();
  const cross = new T.Vector2(-axis.y, axis.x);
  const gallery = stations.map(u => bay.at(u, 0));
  let bestScore = -Infinity;
  for (const inward of [axis, cross, axis.clone().negate(), cross.clone().negate()]) {
    const tangent = new T.Vector2(-inward.y, inward.x);
    const along = unit.outline.map(p => p.dot(tangent));
    const mid = (Math.min(...along) + Math.max(...along)) / 2;
    const edge = Math.min(...unit.outline.map(p => p.dot(inward)));
    // The measured door jambs step in from the external face of each unit.
    for (const reveal of [.30, .42, .56]) {
      const front = tangent.clone().multiplyScalar(mid).addScaledVector(inward, edge + reveal);
      if (!contains(front, unit.outline) || !contains(front, wing.points)) continue;
      const radius = Math.min(
        roomHalfWidth(unit.outline, front, tangent, inward, near, far),
        roomHalfWidth(wing.points, front, tangent, inward, near, far));
      const width = Math.min(bay.width, 2 * (radius - margin));
      if (width < 1.35) continue;
      // Match the surveyed frontage to the closest part of its own arcade looking into the room.
      for (let i = 0; i < stations.length; i++) {
        const u = stations[i];
        const mouthWidth = Math.min(width, 2 * (half - Math.abs(u)));
        if (mouthWidth < 1.15) continue;
        const approach = front.clone().sub(gallery[i]);
        const distance = approach.length();
        if (distance < .2 || approach.dot(inward) < distance * .55) continue;
        const direction = bay.at(u+.07,0).sub(bay.at(u-.07,0)).normalize();
        const alignment = tangent.dot(direction);
        if (Math.abs(alignment) < .55) continue;
        const scale = mouthWidth / width;
        const score = -distance + Math.abs(alignment) * .5 + Math.min(width, 3) * .15 + 2 * scale;
        if (score <= bestScore) continue;
        bestScore = score;
        const across = tangent.clone().multiplyScalar(Math.sign(alignment));
        const galleryAt = (along: number) => u + along * scale;
        bay.shop = { width, galleryAt, at(along, depth) {
          const lane = glass - .34, lip = glass - .18;
          const station = galleryAt(along);
          if (depth <= lane) return bay.at(station, depth);
          const p = front.clone().addScaledVector(across, along);
          if (depth >= lip) return p.addScaledVector(inward, depth - glass);
          return bay.at(station, lane).lerp(p.addScaledVector(inward, lip - glass), (depth - lane)/(lip - lane));
        }};
      }
    }
  }
}

// A room can run deeper while its rear wall stays nearer its own frontage than any other public edge
// (so rooms on opposite faces never meet), clear of the back walls and of the units holding fitted
// end shops, and neither pinched nor fanned out by a bend in the frontage.
function roomDepth(bay: Frontage, wing: Boundary, glass: number, fitted: Unit[]) {
  const { points, publicEdge } = wing;
  const stations = Math.max(2, Math.ceil(bay.width / .5)), pitch = bay.width / stations;
  const longest = Math.max(...points.map((p, i) => p.distanceTo(points[(i + 1) % points.length])));
  function fits(depth: number) {
    const inset = glass + depth + .1, reach = inset + longest;
    let previous: T.Vector2 | undefined;
    for (let s = 0; s <= stations; s++) {
      const p = bay.at(s * pitch - bay.width / 2, inset);
      const chord = previous ? p.distanceTo(previous) / pitch : 1;
      if (chord < .72 || chord > 1.4 || fitted.some(unit => contains(p, unit.outline))) return false;
      previous = p;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const dx = p.x - a.x, dy = p.y - a.y, ex = b.x - a.x, ey = b.y - a.y;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        const t = T.MathUtils.clamp((dx * ex + dy * ey) / (ex * ex + ey * ey), 0, 1);
        if (Math.hypot(dx - t * ex, dy - t * ey) < (publicEdge[i] ? inset - .05 : .25)) return false;
      }
    }
    return true;
  }
  let depth = displayDepth;
  while (depth < deepRoom && fits(Math.min(depth + .25, deepRoom))) depth = Math.min(depth + .25, deepRoom);
  return depth;
}

const cache = new WeakMap<Unit[], Map<Boundary, Partial<Record<Floor | "gallery", RetailBay[]>>>>();

/** Project the measured shop positions onto the public-facing edge of their own architectural wing. */
export function retailBays(wing: Boundary, units: Unit[], floor?: Floor): RetailBay[] {
  let wings = cache.get(units);
  if (!wings) { wings = new Map(); cache.set(units, wings); }
  let byFloor = wings.get(wing);
  if (!byFloor) { byFloor = {}; wings.set(wing, byFloor); }
  const key = floor ?? "gallery";
  if (byFloor[key]) return byFloor[key];
  const {points, publicEdge, insets} = wing;
  const starts = [0];
  const edges = points.flatMap((p, index) => {
    if (!publicEdge[index]) return [];
    const next = (index + 1) % points.length;
    const delta = points[next].clone().sub(p);
    const length = delta.length();
    const start = starts[starts.length - 1];
    starts.push(start + length);
    return [{ index, next, delta, start, length }];
  });
  const total = starts[starts.length - 1];
  const closed = publicEdge.every(Boolean);
  function sample(distance: number, inset: number) {
    const s = closed ? T.MathUtils.euclideanModulo(distance, total) : T.MathUtils.clamp(distance, 0, total);
    let low = 0, high = edges.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (starts[middle + 1] < s) low = middle + 1;
      else high = middle;
    }
    const edge = edges[low];
    const t = (s - edge.start) / edge.length;
    const n = insets[edge.index].clone().lerp(insets[edge.next], t);
    return points[edge.index].clone().addScaledVector(edge.delta, t).addScaledVector(n, inset);
  }
  function stationOf(point: T.Vector2) {
    let at = 0, min = Infinity;
    for (const edge of edges) {
      const a = points[edge.index];
      const diff = point.clone().sub(a);
      const t = T.MathUtils.clamp(diff.dot(edge.delta) / edge.delta.lengthSq(), 0, 1);
      const d = diff.addScaledVector(edge.delta, -t).lengthSq();
      if (d < min) {
        at = edge.start + t * edge.length;
        min = d;
      }
    }
    return at;
  }
  const sorted = units.filter(unit => contains(unit.centre, points))
    .map(unit => ({ unit, at: stationOf(unit.centre) }))
    .sort((a, b) => a.at - b.at || a.unit.id - b.unit.id);
  if (!sorted.length) return [];
  // At a tight curve several projections can land on the same corner. Reserve a usable doorway for each.
  const minWidth = Math.min(1.48, total / sorted.length);
  const start = closed ? (sorted[0].at + sorted[sorted.length - 1].at - total) / 2 : 0;
  const divisions = [start];
  for (let i = 1; i < sorted.length; i++) {
    const midpoint = (sorted[i - 1].at + sorted[i].at) / 2;
    divisions.push(T.MathUtils.clamp(midpoint, divisions[i - 1] + minWidth, start + total - (sorted.length - i) * minWidth));
  }
  divisions.push(start + total);
  const stairShops = floor ? pavilionStairShops[floor] : undefined;
  const bays = sorted.map(({unit}, index) => {
    let left = divisions[index], right = divisions[index + 1];
    if (unit.id === stairShops?.[0]) {
      right = stationOf(new T.Vector2(pavilionStair.left, pavilionStair.galleryEdge));
    } else if (unit.id === stairShops?.[1]) {
      left = stationOf(new T.Vector2(pavilionStair.right, pavilionStair.galleryEdge));
    }
    const width = right - left;
    const mid = (left + right) / 2;
    const bay: RetailBay = { id: unit.id, width, depth: displayDepth, at: (along, inset) => sample(mid + along, inset) };
    if (floor) fitEndShop(bay, wing, unit, floor);
    return bay;
  });
  if (floor) {
    // A shop on the next side of the bend can share the same projected display space.
    // Fit those neighbours too, until each repaired room has clear party walls.
    let protectedUnits = sorted.filter((_, i) => bays[i].shop).map(entry => entry.unit);
    while (protectedUnits.length) {
      const next: Unit[] = [];
      bays.forEach((bay, i) => {
        if (bay.shop) return;
        const unit = sorted[i].unit;
        fitEndShop(bay, wing, unit, floor, protectedUnits);
        if (bay.shop) next.push(unit);
      });
      protectedUnits = next;
    }
    const fitted = sorted.filter((_, i) => bays[i].shop).map(entry => entry.unit);
    for (const bay of bays) if (!bay.shop) bay.depth = roomDepth(bay, wing, glassSetback[floor], fitted);
  }
  byFloor[key] = bays;
  return bays;
}
