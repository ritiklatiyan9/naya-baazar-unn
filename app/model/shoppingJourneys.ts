import * as T from "three";
import type { Floor } from "./geometry";
import { displayDepth, glassSetback, shopEntrance, shopFloorHeight, type RetailBay } from "./retailFrontages";
import type { PersonPose } from "./shoppers";
import { wingBoundaries, type Boundary } from "./wings";

type Stop = {
  bay: RetailBay;
  doorAlong: number;
  door: T.Vector2;
  thresholdPath: T.Vector2[];
  displayHeading: number;
};

type Leg = {
  from: Stop;
  to: Stop;
  path: T.CatmullRomCurve3;
  length: number;
  speed: number;
  walkTime: number;
  dwell: number;
  departHeading: number;
  arriveHeading: number;
};

export type ShoppingJourney = {
  legs: Leg[];
  cycleTime: number;
  cycleDistance: number;
  phase: number;
  floorY: number;
};

export function hasDisplayAisle(arcade: RetailBay) {
  const bay = arcade.shop ?? arcade;
  if (bay.width < 2.65) return false;
  const middle = bay.at(0, 0);
  const incoming = middle.clone().sub(bay.at(-1, 0)).normalize();
  const outgoing = bay.at(1, 0).sub(middle).normalize();
  return incoming.dot(outgoing) > .96;
}

function shopStop(arcade: RetailBay, along: number, inset: number, lane: number): Stop {
  const bay = arcade.shop ?? arcade;
  const { center } = shopEntrance(bay.width);
  const display = Math.min(.96, bay.width * .5 - .53);
  const door = bay.at(center, inset);
  const normal = bay.at(display, inset + 1.6).sub(bay.at(display, inset + 1));
  // The displays stand against the rear wall, further in where the room is deeper.
  const rear = inset + arcade.depth - displayDepth;
  // Keep the approach perpendicular to the glass until clear of the inward-opening leaf.
  const thresholdPath = [
    bay.at(display, rear + 1.13), bay.at((display + center) / 2, rear + 1.05),
    bay.at(center, inset + .76), bay.at(center, inset + .30), door,
    bay.at(center, (lane + inset) / 2), bay.at(center, lane),
  ];
  return { bay: arcade, doorAlong: along + (arcade.shop?.galleryAt(center) ?? center), door, thresholdPath, displayHeading: Math.atan2(normal.x, normal.y) };
}

// Where two façades converge at a pavilion tip, a long bay may project onto both.
// Only place a display visitor if there is room behind the whole door approach.
function hasClearInterior(wing: Boundary, stop: Stop, inset: number) {
  function clear(point: T.Vector2, depth: number) {
    return wing.points.every((a, i) => {
      if (!wing.publicEdge[i]) return true;
      const b = wing.points[(i + 1) % wing.points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const u = T.MathUtils.clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      return (point.x - a.x - u * dx) ** 2 + (point.y - a.y - u * dy) ** 2 >= (depth - .20) ** 2;
    });
  }
  return clear(stop.thresholdPath[0], inset + stop.bay.depth - displayDepth + 1.13) && clear(stop.thresholdPath[2], inset + .76);
}

const speedRamp = .55;
const heading = (tangent: T.Vector3) => Math.atan2(tangent.x, tangent.z);
const point = new T.Vector3(), tangent = new T.Vector3();

function connectShops(from: Stop, to: Stop, first: RetailBay, lane: number, seed: number): Leg {
  const lengthAlong = to.doorAlong - from.doorAlong;
  const count = Math.max(2, Math.ceil(Math.abs(lengthAlong) / .67));
  const gallery = Array.from({ length: count - 1 }, (_, i) => first.at(from.doorAlong + lengthAlong * (i + 1) / count, lane));
  const points = [...from.thresholdPath, ...gallery, ...to.thresholdPath.slice().reverse()];
  const path = new T.CatmullRomCurve3(points.map(p => new T.Vector3(p.x, 0, p.y)), false, "centripetal");
  path.arcLengthDivisions = Math.max(96, points.length * 6);
  const length = path.getLength(), speed = .77 + (seed % 9) * .035;
  const dwell = 5.6 + (to.bay.id * 7 + seed * 11) % 10;
  return {
    from, to, path, length, speed, walkTime: length / speed + speedRamp, dwell,
    departHeading: heading(path.getTangent(0)), arriveHeading: heading(path.getTangent(1)),
  };
}

// Each traveller has a small itinerary of neighbouring shops, a clear display to approach
// at each stop, and a separate part of the arcade from the other shop-to-shop travellers.
export function wingJourneys(bays: RetailBay[], floor: Floor, occupied: Set<number>, wingIndex: number, receivingDoors: number[]) {
  const first = bays[0], lane = glassSetback[floor] - .34;
  let edge = -first.width / 2;
  const stops: Stop[] = [];
  for (const bay of bays) {
    if (hasDisplayAisle(bay) && !occupied.has(bay.id)) {
      const stop = shopStop(bay, edge + bay.width / 2, glassSetback[floor], lane);
      if (hasClearInterior(wingBoundaries[wingIndex], stop, glassSetback[floor])) stops.push(stop);
    }
    edge += bay.width;
  }
  const journeys: ShoppingJourney[] = [];
  for (let i = 0; i + 1 < stops.length;) {
    const firstIndex = i;
    const visits = [stops[i++]];
    while (i < stops.length && visits.length < 3) {
      if (receivingDoors.some(door => stops[firstIndex].doorAlong < door && stops[i].doorAlong > door)) break;
      visits.push(stops[i++]);
    }
    if (visits.length < 2) continue;
    const seed = (floor === "first" ? 151 : 7) + wingIndex * 37 + firstIndex * 13;
    if (seed % 2) visits.reverse();
    const legs = visits.map((stop, j) => connectShops(stop, visits[(j + 1) % visits.length], first, lane, seed + j));
    const cycleTime = legs.reduce((sum, leg) => sum + leg.walkTime + leg.dwell, 0);
    const cycleDistance = legs.reduce((sum, leg) => sum + leg.length, 0);
    journeys.push({ legs, cycleTime, cycleDistance, phase: ((seed * .61803398875) % 1) * cycleTime, floorY: shopFloorHeight[floor] });
  }
  return journeys;
}

function turn(from: number, to: number, amount: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * T.MathUtils.smoothstep(amount, 0, 1);
}

function openApproachingDoor(stop: Stop, pose: PersonPose, openDoors: Set<number>) {
  if ((pose.x - stop.door.x) ** 2 + (pose.z - stop.door.y) ** 2 < 1.55 ** 2) openDoors.add(stop.bay.id);
}

export function evaluateJourney(journey: ShoppingJourney, time: number, pose: PersonPose, openDoors: Set<number>) {
  const clock = time + journey.phase;
  let phase = T.MathUtils.euclideanModulo(clock, journey.cycleTime);
  let travelled = Math.floor(clock / journey.cycleTime) * journey.cycleDistance;
  let index = 0;
  while (index < journey.legs.length - 1) {
    const leg = journey.legs[index], duration = leg.walkTime + leg.dwell;
    if (phase < duration) break;
    phase -= duration;
    travelled += leg.length;
    index++;
  }
  const leg = journey.legs[index];
  pose.time = time;
  pose.floorY = journey.floorY;
  if (phase < leg.walkTime) {
    const remaining = leg.walkTime - phase;
    const distance = phase < speedRamp ? .5 * leg.speed * phase * phase / speedRamp :
      remaining < speedRamp ? leg.length - .5 * leg.speed * remaining * remaining / speedRamp :
        leg.speed * (phase - .5 * speedRamp);
    const u = T.MathUtils.clamp(distance / leg.length, 0, 1);
    leg.path.getPointAt(u, point);
    leg.path.getTangentAt(u, tangent);
    pose.x = point.x; pose.z = point.z;
    pose.heading = heading(tangent);
    pose.walking = Math.min(1, phase / speedRamp, remaining / speedRamp);
    pose.browsing = 0;
    pose.stride = (travelled + distance) * (2 * Math.PI / 1.38);
    openApproachingDoor(leg.from, pose, openDoors);
    openApproachingDoor(leg.to, pose, openDoors);
  } else {
    const dwellTime = phase - leg.walkTime, remaining = leg.dwell - dwellTime;
    const display = leg.to.thresholdPath[0];
    pose.x = display.x; pose.z = display.y;
    const next = journey.legs[(index + 1) % journey.legs.length];
    pose.heading = remaining < 1.15 ? turn(leg.to.displayHeading, next.departHeading, 1 - remaining / 1.15) :
      turn(leg.arriveHeading, leg.to.displayHeading, dwellTime / 1.25);
    const reaching = .72 + .28 * Math.sin(dwellTime * 1.9 + leg.to.bay.id);
    pose.browsing = T.MathUtils.smoothstep(Math.min(dwellTime, remaining), 0, 1.25) * reaching;
    pose.walking = 0;
    pose.stride = (travelled + leg.length) * (2 * Math.PI / 1.38);
  }
}
