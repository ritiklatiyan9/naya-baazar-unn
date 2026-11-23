import * as T from "three";
import { sheetPoint, type Floor, type Unit } from "./geometry";
import { displayDepth, glassSetback, retailBays, shopEntrance, shopFloorHeight } from "./retailFrontages";
import { wingBoundaries } from "./wings";
import { shopCheckout } from "./shopCheckouts";
import { shopperPortraits } from "./shopperAppearance";
import { makeShopperBatch, type PersonPose } from "./shoppers";
import { createTraffic } from "./traffic";
import { buildCafes } from "./cafes";
import { evaluateJourney, hasDisplayAisle, wingJourneys, type ShoppingJourney } from "./shoppingJourneys";

type Route = {
  path: T.CatmullRomCurve3;
  length: number;
  speed: number;
  hold: number;
  offset: number;
  floorY: number;
  look: number;
  browse: boolean;
};
const xy = (p: T.Vector2) => new T.Vector3(p.x, 0, p.y);
const angle = (x: number, z: number) => Math.atan2(x, z);
function turn(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * T.MathUtils.smoothstep(t, 0, 1);
}

function footpath(points: T.Vector2[], floorY: number, browse: boolean, look: number, seed: number): Route {
  const path = new T.CatmullRomCurve3(points.map(xy), false, "centripetal");
  const speed = browse ? .47 + (seed % 4) * .054 : .75 + (seed % 7) * .071;
  const length = path.getLength(), hold = (browse ? 4.4 : 1.7) + (seed % 5) * .57;
  const offset = ((seed * 137.51) % 37.7) / 37.7 * (length / speed + hold) * 2;
  return { path, length, speed, hold, offset, floorY, look, browse };
}

function floorRoutes(units: Unit[], floor: Floor, serviceShopIds: number[] = []) {
  const routes: Route[] = [];
  const journeys: ShoppingJourney[] = [];
  const shopkeepers: PersonPose[] = [];
  for (const [wingIndex, wing] of wingBoundaries.entries()) {
    const bays = retailBays(wing, units, floor);
    if (!bays.length) continue;
    // Each walker has an independent stretch of the continuous arcade, with a landing between routes.
    const total = bays.reduce((sum, b) => sum + b.width, 0);
    const sections = Math.max(1, Math.round(total / (floor === "first" ? 20 : 31)));
    const first = bays[0], initial = -first.width / 2;
    let edge = initial;
    const receivingDoors: number[] = [];
    for (const bay of bays) {
      if (serviceShopIds.includes(bay.id)) receivingDoors.push(edge + bay.width / 2 + shopEntrance(bay.width).center);
      edge += bay.width;
    }
    for (let i = 0; i < sections; i++) {
      let start = initial + (i + .14) * total / sections;
      let end = initial + (i + .86) * total / sections;
      // Leave a crossing for cartons moving between the curb and the receiving shop.
      for (const receivingDoor of receivingDoors) {
        if (receivingDoor + 1.25 <= start || receivingDoor - 1.25 >= end) continue;
        if (receivingDoor - start > end - receivingDoor) end = receivingDoor - 1.25;
        else start = receivingDoor + 1.25;
      }
      if (end - start < 1.8) continue;
      // Leave the inner lane next to the windows free for shoppers changing shops.
      const inset = floor === "first" ? .78 : .84;
      const count = Math.ceil((end - start) / .70);
      const points = Array.from({ length: count + 1 }, (_, n) => first.at(start + (end - start) * n / count, inset));
      const middle = (start + end) / 2;
      const normal = first.at(middle, inset + .25).sub(first.at(middle, inset));
      routes.push(footpath(points, shopFloorHeight[floor], false, angle(normal.x, normal.y), wingIndex * 41 + i * 3 + (floor === "first" ? 22 : 11)));
    }

    // Only occupy the clear aisle behind each display window. Curved end caps stay open.
    const regular = bays.filter(hasDisplayAisle);
    const occupied = new Set(serviceShopIds);
    for (const arcade of bays) {
      const checkout = shopCheckout(arcade, floor, units);
      if (!checkout) continue;
      occupied.add(arcade.id);
      shopkeepers.push({ x: checkout.clerk.x, z: checkout.clerk.y, floorY: shopFloorHeight[floor],
        heading: checkout.heading, tillHand: checkout.tillHand, stride: 0, walking: 0, browsing: 0, time: 0 });
    }
    const stride = 4;
    const offset = (wingIndex + (floor === "first" ? 2 : 0)) % stride;
    for (let i = offset; i < regular.length; i += stride) {
      const arcade = regular[i], bay = arcade.shop ?? arcade;
      if (occupied.has(arcade.id)) continue;
      occupied.add(arcade.id);
      const span = Math.min(1.2, bay.width * .5 - .52);
      // Browsers keep to the displays, which stand against the rear wall of a deeper room.
      const depth = glassSetback[floor] + arcade.depth - displayDepth;
      const normal = bay.at(0, depth + 1).sub(bay.at(0, depth));
      const points = [bay.at(-span, depth + .91), bay.at(0, depth + .75), bay.at(span, depth + 1)];
      routes.push(footpath(points, shopFloorHeight[floor], true, angle(normal.x, normal.y), i + wingIndex * 53 + (floor === "first" ? 12 : 8)));
    }
    journeys.push(...wingJourneys(bays, floor, occupied, wingIndex, receivingDoors));
  }
  return { routes, journeys, shopkeepers };
}

// Independent pedestrian routes stay on the plaza tiles, clear of the rosette, planters and drive.
function plazaRoutes() {
  const paths: [number, number][][] = [
    [[923, 575], [962, 571], [999, 571]],
    [[1010, 585], [1050, 583], [1090, 582]],
    [[1107, 583], [1158, 581], [1195, 588]],
    [[1213, 608], [1227, 632], [1225, 665]],
    [[1198, 713], [1173, 716], [1140, 718]],
    [[1120, 709], [1085, 714], [1039, 716]],
    [[1020, 707], [979, 709], [942, 715]],
    [[917, 702], [893, 685], [881, 663]],
    [[837, 707], [806, 708], [782, 701]],
    [[698, 651], [680, 649], [661, 645]],
    [[336, 508], [356, 516], [375, 524]],
    [[408, 508], [437, 511], [469, 516]],
  ];
  return paths.map((points, i) => footpath(points.map(([x, z]) => sheetPoint(x, z)), .115, false, i * .79, 121 + i));
}

const point = new T.Vector3(), tangent = new T.Vector3();
function evaluateRoute(route: Route, time: number, pose: PersonPose) {
  const ramp = Math.min(.58, route.length / (route.speed * 3));
  const leg = route.length / route.speed + ramp, half = leg + route.hold;
  const clock = time + route.offset;
  const phase = T.MathUtils.euclideanModulo(clock, half * 2);
  const reverse = phase >= half;
  const local = phase % half;
  const travel = Math.min(local, leg);
  // Integrating short acceleration ramps makes foot speed reach zero at a display.
  const distance = travel < ramp ? .5 * route.speed * travel * travel / ramp :
    travel > leg - ramp ? route.length - .5 * route.speed * (leg - travel) ** 2 / ramp :
      route.speed * (travel - ramp * .5);
  const walk = T.MathUtils.clamp(Math.min(travel, leg - travel) / ramp, 0, 1);
  const u = T.MathUtils.clamp((reverse ? route.length - distance : distance) / route.length, 0, 1);
  route.path.getPointAt(u, point);
  route.path.getTangentAt(u, tangent);
  const heading = angle(tangent.x, tangent.z) + (reverse ? Math.PI : 0);
  let yaw = heading, browsing = 0;
  if (local > leg) {
    const dwell = (local - leg) / route.hold, depart = heading + Math.PI;
    yaw = dwell < .43 ? turn(heading, route.look, dwell / .43) : turn(route.look, depart, (dwell - .57) / .43);
    browsing = route.browse ? Math.sin(dwell * Math.PI) ** .85 : 0;
  }
  pose.x = point.x; pose.z = point.z; pose.floorY = route.floorY;
  pose.heading = yaw;
  const travelled = Math.floor(clock / (half * 2)) * route.length * 2 + (reverse ? route.length : 0) + distance;
  pose.stride = travelled * (Math.PI * 2 / 1.38);
  pose.walking = walk; pose.browsing = browsing; pose.time = time;
}

export function buildMarketActivity(scene: T.Scene, groundUnits: Unit[], firstUnits: Unit[]) {
  const street = new T.Group(), upper = new T.Group();
  street.name = "Ground-floor market activity";
  upper.name = "First-floor market activity";
  scene.add(street, upper);
  const traffic = createTraffic(street, groundUnits);
  const cafes = buildCafes(street, groundUnits);
  const streetWalkers = floorRoutes(groundUnits, "ground", traffic.serviceShopIds);
  streetWalkers.routes.unshift(...plazaRoutes());
  const faces = shopperPortraits();

  function level(group: T.Group, walkers: ReturnType<typeof floorRoutes>, seed: number, groundFloor: boolean) {
    const { routes, journeys } = walkers;
    const poses: PersonPose[] = Array.from({ length: routes.length + journeys.length }, () =>
      ({ x: 0, z: 0, floorY: 0, heading: 0, stride: 0, walking: 0, browsing: 0, time: 0 }));
    const cashierStart = poses.length;
    poses.push(...walkers.shopkeepers);
    const workerStart = poses.length;
    if (groundFloor) poses.push(...traffic.workerPoses);
    const dinerStart = poses.length;
    if (groundFloor) poses.push(...cafes.diners);
    const people = makeShopperBatch(group, poses.length, seed, faces.material, dinerStart, workerStart, cashierStart);
    const openDoors = new Set<number>();
    return {
      openDoors,
      update(time: number, deliveryTime?: number) {
        openDoors.clear();
        for (const keeper of walkers.shopkeepers) keeper.time = time;
        for (let i = 0; i < routes.length; i++) evaluateRoute(routes[i], time, poses[i]);
        for (let i = 0; i < journeys.length; i++) evaluateJourney(journeys[i], time, poses[routes.length + i], openDoors);
        if (groundFloor) {
          traffic.update(time, openDoors, deliveryTime);
          for (const diner of cafes.diners) diner.time = time;
        }
        people.update(poses);
      },
      setCameraPosition: people.setCameraPosition,
    };
  }
  const ground = level(street, streetWalkers, 3, true);
  const first = level(upper, floorRoutes(firstUnits, "first"), 251, false);
  let elapsed = 0;
  function update(time: number, deliveryTime?: number) {
    elapsed = time;
    ground.update(time, deliveryTime);
    if (upper.visible) first.update(time);
  }
  update(0);
  return {
    update, facesReady:faces.ready,
    openDoors: { ground: ground.openDoors, first: first.openDoors },
    setCameraPosition(position:T.Vector3) {
      ground.setCameraPosition(position);
      if(upper.visible)first.setCameraPosition(position);
    },
    setUpperVisible(show: boolean) {
      if (show && !upper.visible) first.update(elapsed);
      upper.visible = show;
    },
  };
}
