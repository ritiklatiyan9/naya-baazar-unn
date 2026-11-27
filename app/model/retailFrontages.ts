import * as T from "three";
import type { Floor, Unit } from "./geometry";
import type { Boundary } from "./wings";
import { pavilionStair, pavilionStairShops } from "./pavilionStairLayout";

// The shopfront glass stands this far behind the slab edge on both storeys: a 2.4 m covered walk in front of every shop.
const shopfront = 2.4;
export const glassSetback = { ground: shopfront, first: shopfront };
export const shopFloorHeight = { ground: 0.29, first: 3.82 };
/** The display zone at the back of a room: wall displays, the checkout and the aisle in front of them. */
export const displayDepth = 2.37;
// A display window for a unit with no frontage of its own on this arcade runs at most this deep.
const deepRoom = 3.8;
export const displayCount = (width: number) => Math.ceil(width / 3);
export const shelfWidth = (span: number) => Math.min(2.02, span * .78);

export function shopEntrance(width: number) {
  return { center: width < 2.6 ? 0 : -Math.min(0.81, width * 0.16), halfWidth: Math.min(0.51, width * 0.31) };
}

/** The middle of a bay's shop door, measured along its arcade. */
export function doorStation(arcade: RetailBay) {
  const { center } = shopEntrance((arcade.shop ?? arcade).width);
  return arcade.shop ? arcade.shop.galleryAt(center) : center;
}

/** Rectangle in a room's own frame: `along` the glass and `depth` behind it. Wall displays stand against side -1 or +1. */
export type RoomFixture = { kind: "wall" | "table"; side: -1 | 1; along: [number, number]; depth: [number, number] };
/**
 * A deep room keeps a clear aisle straight in from its door to the aisle in front of the rear displays.
 * Displays stand out .68 m from the side walls, and a table or rail stands on the far side of the entry aisle.
 */
export function roomFixtures(width: number, depth: number): RoomFixture[] {
  const { center } = shopEntrance(width), half = width / 2, shelf = .68;
  const front = 1.2, back = depth - 2.05, fixtures: RoomFixture[] = [];
  if (back - front < .8 || width < 2.1) return fixtures;
  const wall = (side: -1 | 1) => fixtures.push({ kind: "wall", side, along: side < 0 ? [-half, -half + shelf] : [half - shelf, half], depth: [front, back] });
  // A narrow room has displays on both walls, a middling one a table in place of the far wall's, a wide one both.
  wall(-1);
  if (width < 2.6 || width >= 3.6) wall(1);
  const from = center + .55, to = half - (width < 3.6 ? .2 : shelf + .3), table = Math.min(width < 3.6 ? .9 : 1.4, to - from);
  if (width >= 2.6 && table >= .6) {
    const zone = back - front, count = Math.max(1, Math.floor((zone + .7) / 2.4));
    const length = Math.min(1.7, (zone - .7 * (count - 1)) / count), first = front + (zone - count * length - (count - 1) * .7) / 2;
    for (let i = 0; i < count; i++) {
      const start = first + i * (length + .7);
      fixtures.push({ kind: "table", side: 1, along: [(from + to - table) / 2, (from + to + table) / 2], depth: [start, start + length] });
    }
  }
  return fixtures;
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
  /** The room runs on to the glass of the arcade on the far side of its block, so it has no rear wall. */
  through?: boolean;
  /** The room when it takes only part of the bay's width: the part over its own unit, in the bay's own frame. */
  shop?: Frontage & { galleryAt: (along: number) => number };
};

export function contains(point: T.Vector2, ring: T.Vector2[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/** Distance along the ray origin + direction·d to segment ab, or NaN when it misses. */
function rayHit(origin: T.Vector2, direction: T.Vector2, a: T.Vector2, b: T.Vector2) {
  const ex = b.x - a.x, ey = b.y - a.y, den = direction.x * ey - direction.y * ex;
  if (Math.abs(den) < 1e-12) return NaN;
  const ox = a.x - origin.x, oy = a.y - origin.y, s = (ox * direction.y - oy * direction.x) / den;
  return s >= 0 && s < 1 ? (ox * ey - oy * ex) / den : NaN;
}
function crossings(origin: T.Vector2, direction: T.Vector2, ring: T.Vector2[]) {
  const out: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = rayHit(origin, direction, ring[j], ring[i]);
    if (!Number.isNaN(d)) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

function segmentsCross(a: T.Vector2, b: T.Vector2, c: T.Vector2, d: T.Vector2) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? new T.Vector2(a.x + t * rx, a.y + t * ry) : null;
}

const shopfronts = new WeakMap<Boundary, T.Vector2[]>();
/**
 * The shopfront line of a wing at every outline vertex: the gallery edge offset by the glass setback.
 * Inside a sharp corner the two offset lines overlap in a small loop; the loop is cut back to the point
 * where they cross, so the glass, the soffit and the walkway all turn the corner on one clean line.
 */
export function glassPoints(wing: Boundary) {
  let line = shopfronts.get(wing);
  if (line) return line;
  const { points, insets, publicEdge } = wing, n = points.length;
  line = points.map((p, i) => p.clone().addScaledVector(insets[i], shopfront));
  const runs: number[][] = [];
  if (publicEdge.every(Boolean)) {
    // A closed loop is walked from its straightest vertex, so no corner straddles the ends of the walk.
    const turn = (i: number) => {
      const a = points[(i + n - 1) % n], b = points[i], c = points[(i + 1) % n];
      return Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
    };
    const start = points.reduce((best, _, i) => turn(i) < turn(best) ? i : best, 0);
    runs.push(Array.from({ length: n + 1 }, (_, i) => (start + i) % n));
  }
  else for (let i = 0; i < n; i++) {
    if (!publicEdge[i] || publicEdge[(i + n - 1) % n]) continue;
    const run = [i];
    for (let j = i; publicEdge[j]; ) { j = (j + 1) % n; run.push(j); }
    runs.push(run);
  }
  for (const run of runs) {
    const q = run.map(i => line![i]);
    for (let a = 0; a + 1 < q.length; a++) {
      for (let b = a + 2; b + 1 < q.length && b <= a + 24; b++) {
        if (run[b + 1] === run[a]) break;
        const x = segmentsCross(q[a], q[a + 1], q[b], q[b + 1]);
        if (!x) continue;
        for (let k = a + 1; k <= b; k++) q[k].copy(x);
        a = b - 1;
        break;
      }
    }
  }
  shopfronts.set(wing, line);
  return line;
}

// The glass line of a whole wing, as segments, for rooms that run through to the opposite arcade.
const glassLines = new WeakMap<Boundary, [T.Vector2, T.Vector2][]>();
function wingGlass(wing: Boundary) {
  let lines = glassLines.get(wing);
  if (!lines) {
    const line = glassPoints(wing);
    lines = line.flatMap((p, i) => wing.publicEdge[i] ? [[p, line[(i + 1) % line.length]] as [T.Vector2, T.Vector2]] : []);
    glassLines.set(wing, lines);
  }
  return lines;
}
const bounds = new WeakMap<Unit, T.Box2>();
const unitBounds = (unit: Unit) => bounds.get(unit) ?? bounds.set(unit, new T.Box2().setFromPoints(unit.outline)).get(unit)!;

const columnStep = .1, forecourt = 1, narrowest = 1.35, shallowest = 1.5;
type Column = { depth: number; through: boolean } | null;

/**
 * How deep the bay's own unit runs behind the glass on one ray into the room, measured from the glass.
 * A unit whose front stands a little behind the glass line gains that strip, provided no other unit lies in it.
 * The room ends at the unit's rear wall, or at the glass of an arcade on the far side when the unit runs right through.
 */
function column(origin: T.Vector2, direction: T.Vector2, unit: Unit, units: Unit[], lines: [T.Vector2, T.Vector2][]): Column {
  let inside = contains(origin, unit.outline), entry = inside ? 0 : NaN, exit = NaN;
  for (const d of crossings(origin, direction, unit.outline)) {
    if (d <= 0) continue;
    if (inside) { exit = d; break; }
    entry = d; inside = true;
  }
  if (Number.isNaN(exit) || entry > forecourt) return null;
  const at = (d: number) => origin.clone().addScaledVector(direction, d);
  const strip = new T.Box2().setFromPoints([origin, at(entry)]).expandByScalar(.01);
  for (const other of units) {
    if (other === unit || !unitBounds(other).intersectsBox(strip)) continue;
    if (contains(origin, other.outline) || crossings(origin, direction, other.outline).some(d => d > 0 && d < entry)) return null;
  }
  const reach = new T.Box2().setFromPoints([at(.3), at(exit)]);
  let stop = exit;
  for (const [a, b] of lines) {
    if (Math.max(a.x, b.x) < reach.min.x || Math.min(a.x, b.x) > reach.max.x || Math.max(a.y, b.y) < reach.min.y || Math.min(a.y, b.y) > reach.max.y) continue;
    const d = rayHit(origin, direction, a, b);
    if (d > .3 && d < stop) stop = d;
  }
  return stop < exit ? { depth: stop, through: true } : { depth: exit - .02, through: false };
}

/**
 * Give the bay the largest room its own unit allows behind the glass: the widest, deepest rectangle under the
 * scanned depth profile, squared up to the bay's edges where only a party wall separates them.
 */
function fitUnitRoom(bay: RetailBay, unit: Unit, units: Unit[], wing: Boundary, glass: number) {
  const count = Math.max(1, Math.round(bay.width / columnStep)), step = bay.width / count, half = bay.width / 2;
  const lines = wingGlass(wing);
  // Nor may a room reach out in front of the glass of another arcade alongside it.
  const clear = (u: number, depth: number) => [.05, depth / 2, depth - .05].every(d => behindGlass(wing, bay.at(u, glass + d), glass));
  // A room starts only where it runs square into the building from the glass. Close to a sharp corner the glass is
  // pinched and its rays lean over, so the corner itself is left as plain wall.
  const square = (u: number) => {
    const origin = bay.at(u, glass), along = bay.at(u + .05, glass).sub(bay.at(u - .05, glass));
    const direction = bay.at(u, glass + 1).sub(origin);
    return along.lengthSq() > 1e-6 && Math.abs(direction.clone().normalize().dot(along.normalize())) < .14 ? direction : null;
  };
  // Widths are measured along the glass itself, which is shorter or longer than the frontage on a curve.
  const widths: number[] = [];
  const columns: Column[] = Array.from({ length: count }, (_, k) => {
    const u = -half + (k + .5) * step, direction = square(u);
    widths.push(bay.at(u + step / 2, glass).distanceTo(bay.at(u - step / 2, glass)));
    if (!direction || widths[k] < .3 * step || widths[k] > 3 * step) return null;
    const c = column(bay.at(u, glass), direction, unit, units, lines);
    return c && clear(u, c.depth) ? c : null;
  });
  let best = { area: 0, first: 0, last: -1, depth: 0 };
  for (let i = 0; i < count; i++) {
    let low = Infinity, width = 0;
    for (let j = i; j < count; j++) {
      const c = columns[j];
      if (!c || c.depth < shallowest) break;
      low = Math.min(low, c.depth);
      width += widths[j];
      if (width >= narrowest && width * low > best.area) best = { area: width * low, first: i, last: j, depth: low };
    }
  }
  if (best.last < 0) return false;
  // Square the room up to the bay's edge across a party wall; otherwise find the exact limit of the unit or of the
  // glass alongside, so no sliver of floor is left between the room and a neighbouring arcade's glass.
  const fits = (u: number) => {
    const direction = square(u), c = direction && column(bay.at(u, glass), direction, unit, units, lines);
    return !!c && c.depth >= best.depth - .02 && clear(u, best.depth);
  };
  const reach = (edge: number, out: number, bound: number) => {
    if (Math.abs(bound - edge) < .35 && clear(bound - out * .02, best.depth)) return bound;
    let inner = 0, outer = Math.min(.3, Math.abs(bound - edge));
    for (let i = 0; i < 8; i++) { const middle = (inner + outer) / 2; if (fits(edge + out * middle)) inner = middle; else outer = middle; }
    return edge + out * inner;
  };
  const left = reach(-half + best.first * step, -1, -half), right = reach(-half + (best.last + 1) * step, 1, half);
  bay.depth = best.depth;
  bay.through = columns.slice(best.first, best.last + 1).every(c => c!.through);
  if (right - left < bay.width - .01) {
    const middle = (left + right) / 2;
    bay.shop = { width: right - left, galleryAt: along => middle + along, at: (along, inset) => bay.at(middle + along, inset) };
  }
  return true;
}

/** World outline of a bay's room, from its glass to its rear wall. */
export function roomOutline(arcade: RetailBay) {
  const room = arcade.shop ?? arcade, count = Math.max(2, Math.ceil(room.width / .5));
  const edge = (depth: number) => Array.from({ length: count + 1 }, (_, i) => room.at(room.width * (i / count - .5), depth));
  return edge(shopfront).concat(edge(shopfront + arcade.depth).reverse());
}

/** True where a point stands at least `glass` behind every gallery edge of the wing, i.e. not out on one of its galleries. */
export function behindGlass(wing: Boundary, p: T.Vector2, glass: number) {
  const { points, publicEdge } = wing;
  for (let i = 0; i < points.length; i++) {
    if (!publicEdge[i]) continue;
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = p.x - a.x, dy = p.y - a.y, ex = b.x - a.x, ey = b.y - a.y;
    if (Math.abs(dx) > glass + 1 || Math.abs(dy) > glass + 1) continue;
    const t = T.MathUtils.clamp((dx * ex + dy * ey) / (ex * ex + ey * ey), 0, 1);
    if (Math.hypot(dx - t * ex, dy - t * ey) < glass - .02) return false;
  }
  return true;
}

// A display window can run deeper while its rear wall stays nearer its own frontage than any other public edge
// (so rooms on opposite faces never meet), clear of the back walls and of every unit with a room of its own,
// and neither pinched nor fanned out by a bend in the frontage.
function roomDepth(bay: Frontage, wing: Boundary, glass: number, occupied: Unit[]) {
  const { points, publicEdge } = wing;
  const stations = Math.max(2, Math.ceil(bay.width / .5)), pitch = bay.width / stations;
  const longest = Math.max(...points.map((p, i) => p.distanceTo(points[(i + 1) % points.length])));
  function fits(depth: number) {
    const inset = glass + depth + .1, reach = inset + longest;
    let previous: T.Vector2 | undefined;
    for (let s = 0; s <= stations; s++) {
      const p = bay.at(s * pitch - bay.width / 2, inset);
      const chord = previous ? p.distanceTo(previous) / pitch : 1;
      if (chord < .72 || chord > 1.4 || occupied.some(unit => contains(p, unit.outline))) return false;
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
  const line = glassPoints(wing);
  // Across the gallery the mapping runs straight from the slab edge to the shopfront line; behind the glass it
  // continues along the frontage's own inset direction.
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
    const p = points[edge.index].clone().addScaledVector(edge.delta, t);
    if (inset <= 0) return p.addScaledVector(n, inset);
    const glass = line[edge.index].clone().lerp(line[edge.next], t);
    return inset <= shopfront ? p.lerp(glass, inset / shopfront) : glass.addScaledVector(n, inset - shopfront);
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
    return bay;
  });
  if (floor) {
    const glass = glassSetback[floor];
    // Every unit with its own frontage on this arcade shows its whole room, from the glass to its rear wall.
    const roomed = bays.map((bay, i) => fitUnitRoom(bay, sorted[i].unit, units, wing, glass));
    // A unit set back behind its neighbours keeps a display window at its place on the arcade.
    const occupied = sorted.filter((_, i) => roomed[i]).map(entry => entry.unit);
    bays.forEach((bay, i) => { if (!roomed[i]) bay.depth = roomDepth(bay, wing, glass, occupied); });
  }
  byFloor[key] = bays;
  return bays;
}
