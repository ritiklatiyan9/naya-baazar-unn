import * as T from "three";
import type { Unit } from "./geometry";
import type { Boundary } from "./wings";

export const glassSetback = { ground: 1.72, first: 1.9 };
export const shopFloorHeight = { ground: 0.29, first: 3.82 };

export function shopEntrance(width: number) {
  return { center: width < 2.6 ? 0 : -Math.min(0.81, width * 0.16), halfWidth: Math.min(0.51, width * 0.31) };
}

export type RetailBay = {
  id: number;
  width: number;
  /** Along the fascia from the centre of the entrance bay; positive inset goes towards the shop. */
  at: (along: number, inset: number) => T.Vector2;
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

/** Project the measured shop positions onto the public-facing edge of their own architectural wing. */
export function retailBays(wing: Boundary, units: Unit[]): RetailBay[] {
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
  const sorted = units.filter(unit => contains(unit.centre, points)).map(unit => {
    let at = 0, min = Infinity;
    for (const edge of edges) {
      const a = points[edge.index];
      const diff = unit.centre.clone().sub(a);
      const t = T.MathUtils.clamp(diff.dot(edge.delta) / edge.delta.lengthSq(), 0, 1);
      const d = diff.addScaledVector(edge.delta, -t).lengthSq();
      if (d < min) {
        at = edge.start + t * edge.length;
        min = d;
      }
    }
    return { id: unit.id, at };
  }).sort((a, b) => a.at - b.at || a.id - b.id);
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
  return sorted.map((unit, index) => {
    const width = divisions[index + 1] - divisions[index];
    const mid = divisions[index] + width / 2;
    return { id: unit.id, width, at: (along, inset) => sample(mid + along, inset) };
  });
}
