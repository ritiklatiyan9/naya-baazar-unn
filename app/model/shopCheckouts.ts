import * as T from "three";
import type { Floor, Unit } from "./geometry";
import { displayCount, displayDepth, glassSetback, retailBays, type RetailBay } from "./retailFrontages";
import { wingBoundaries } from "./wings";

const featured = { ground: 102, first: 154 };
export const checkoutDepth = 1.40;
export const checkoutTop = .92;

function station(arcade: RetailBay, floor: Floor, stall: number) {
  // The desk keeps its place against the rear wall of a deeper room.
  const bay = arcade.shop ?? arcade, glass = glassSetback[floor] + arcade.depth - displayDepth;
  const span = bay.width / displayCount(bay.width);
  const width = Math.min(1.62, span - .26);
  const along = -bay.width / 2 + stall * span + .13 + width / 2;
  const at = (u: number, depth: number) => bay.at(along + u, glass + depth);
  const clerk = at(-.06, 2.03);
  const outward = at(-.06, 1.43).sub(clerk);
  const heading = Math.atan2(outward.x, outward.y);
  const registerDirection = at(-.2, 2.03).sub(at(0, 2.03));
  const tillHand = Math.sign(registerDirection.dot(new T.Vector2(Math.cos(heading), -Math.sin(heading)))) || 1;
  return {
    stall, width, along, clerk, heading, tillHand,
    footprint(padding = 0): T.Vector2[] {
      const half = width / 2 + padding;
      return [at(-half, checkoutDepth - .285 - padding), at(half, checkoutDepth - .285 - padding),
        at(half, 2.34), at(-half, 2.34)];
    },
  };
}

// A curved end bay can fold back beside its neighbour's display wall. Check the
// whole desk and work area against the actual front-to-back spans of nearby rooms.
function intersects(a: T.Vector2[], b: T.Vector2[]) {
  for (const polygon of [a,b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const axis = new T.Vector2(q.y - p.y, p.x - q.x);
      const av = a.map(v => v.dot(axis)), bv = b.map(v => v.dot(axis));
      if (Math.max(...av) < Math.min(...bv) || Math.max(...bv) < Math.min(...av)) return false;
    }
  }
  return true;
}

const cache = {
  ground: new WeakMap<Unit[], Map<number, ReturnType<typeof station>>>(),
  first: new WeakMap<Unit[], Map<number, ReturnType<typeof station>>>(),
};

function floorStations(units: Unit[], floor: Floor) {
  const bays = wingBoundaries.flatMap(wing => retailBays(wing, units, floor));
  const glass = glassSetback[floor];
  const rooms = bays.flatMap(arcade => {
    const bay = arcade.shop ?? arcade, slices = Math.ceil(bay.width / .55);
    return Array.from({ length: slices }, (_, i) => {
      const a = (i / slices - .5) * bay.width, b = ((i + 1) / slices - .5) * bay.width;
      const rear = glass + arcade.depth + .03;
      const poly = [bay.at(a, glass), bay.at(b, glass), bay.at(b, rear), bay.at(a, rear)];
      return { id: arcade.id, poly, bounds: new T.Box2().setFromPoints(poly) };
    });
  });
  const result = new Map<number, ReturnType<typeof station>>();
  for (const arcade of bays) {
    if (arcade.id !== featured[floor] && arcade.id % 9 !== 2) continue;
    const bay = arcade.shop ?? arcade;
    if (bay.width < 3.18) continue;
    for (let i = displayCount(bay.width) - 1; i >= 0; i--) {
      const desk = station(arcade, floor, i), poly = desk.footprint(.10);
      const bounds = new T.Box2().setFromPoints(poly);
      if (rooms.some(other => other.id !== arcade.id && bounds.intersectsBox(other.bounds) && intersects(poly, other.poly))) continue;
      result.set(arcade.id, desk);
      break;
    }
  }
  cache[floor].set(units, result);
  return result;
}

export function shopCheckout(arcade: RetailBay, floor: Floor, units: Unit[]) {
  return (cache[floor].get(units) ?? floorStations(units, floor)).get(arcade.id);
}
