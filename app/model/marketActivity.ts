import * as T from "three";
import { sheetPoint, type Floor, type Unit } from "./geometry";
import { glassSetback, retailBays, shopFloorHeight } from "./retailFrontages";
import { wingBoundaries } from "./wings";
import { shopperPortraits } from "./shopperAppearance";
import { makeShopperBatch, type PersonPose } from "./shoppers";
import { createTraffic } from "./traffic";

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

function floorRoutes(units: Unit[], floor: Floor) {
  const routes: Route[] = [];
  for (const [wingIndex, wing] of wingBoundaries.entries()) {
    const bays = retailBays(wing, units);
    if (!bays.length) continue;
    // Each walker has an independent stretch of the continuous arcade, with a landing between routes.
    const total = bays.reduce((sum, b) => sum + b.width, 0);
    const sections = Math.max(1, Math.round(total / (floor === "first" ? 20 : 31)));
    const first = bays[0], initial = -first.width / 2;
    for (let i = 0; i < sections; i++) {
      const start = initial + (i + .14) * total / sections;
      const end = initial + (i + .86) * total / sections;
      const inset = floor === "first" ? .75 : 1.18;
      const count = Math.ceil((end - start) / .70);
      const points = Array.from({ length: count + 1 }, (_, n) => first.at(start + (end - start) * n / count, inset));
      const middle = (start + end) / 2;
      const normal = first.at(middle, inset + .25).sub(first.at(middle, inset));
      routes.push(footpath(points, shopFloorHeight[floor], false, angle(normal.x, normal.y), wingIndex * 41 + i * 3 + (floor === "first" ? 22 : 11)));
    }

    // Only occupy the clear aisle behind each display window. Curved end caps stay open.
    const regular = bays.filter(b => {
      if (b.width < 2.65) return false;
      const middle = b.at(0, 0);
      return middle.clone().sub(b.at(-1, 0)).normalize().dot(b.at(1, 0).sub(middle).normalize()) > .96;
    });
    const stride = 4;
    const offset = (wingIndex + (floor === "first" ? 2 : 0)) % stride;
    for (let i = offset; i < regular.length; i += stride) {
      const bay = regular[i];
      const span = Math.min(1.2, bay.width * .5 - .52);
      const depth = glassSetback[floor];
      const normal = bay.at(0, depth + 1).sub(bay.at(0, depth));
      const points = [bay.at(-span, depth + .91), bay.at(0, depth + .75), bay.at(span, depth + 1)];
      routes.push(footpath(points, shopFloorHeight[floor], true, angle(normal.x, normal.y), i + wingIndex * 53 + (floor === "first" ? 12 : 8)));
    }
  }
  return routes;
}

// Independent pedestrian routes stay on the plaza tiles, clear of the rosette, planters and drive.
function plazaRoutes() {
  const paths: [number, number][][] = [
    [[923, 575], [962, 571], [999, 571]],
    [[1010, 590], [1050, 588], [1090, 587]],
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
  const groundRoutes = [...plazaRoutes(), ...floorRoutes(groundUnits, "ground")];
  const upperRoutes = floorRoutes(firstUnits, "first");

  const faces=shopperPortraits();

  function level(group: T.Group, routes: Route[], seed: number) {
    const people = makeShopperBatch(group, routes.length, seed, faces.material);
    const poses = routes.map(() => ({ x: 0, z: 0, floorY: 0, heading: 0, stride: 0, walking: 0, browsing: 0, time: 0 }));
    return {
      update(time:number) {
        for (let i=0;i<routes.length;i++)evaluateRoute(routes[i],time,poses[i]);
        people.update(poses);
      },
      setCameraPosition: people.setCameraPosition,
    };
  }
  const ground = level(street, groundRoutes, 3), first = level(upper, upperRoutes, 251);
  const traffic = createTraffic(street);
  let elapsed = 0;
  function update(time: number) {
    elapsed = time;
    ground.update(time);
    if (upper.visible) first.update(time);
    traffic(time);
  }
  update(0);
  return {
    update, facesReady:faces.ready,
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
