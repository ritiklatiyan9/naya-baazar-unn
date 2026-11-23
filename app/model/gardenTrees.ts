import * as T from "three";
import { Parts, sheetPoint } from "./geometry";
import { PlantSurface } from "./foliage";

const tau = Math.PI * 2;
const up = new T.Vector3(0, 1, 0);
const bark = new T.Color("#735c48");
const shoots = new T.Color("#73744d");
const greens = ["#354f37", "#42623d", "#4e7146", "#608250", "#729256"].map(c => new T.Color(c));

function stem(surface: PlantSurface, a: T.Vector3, b: T.Vector3, r0: number, r1: number, sides: number, tint: T.Color,
  [rootFlex, tipFlex]: [number, number]) {
  const axis = b.clone().sub(a).normalize();
  const x = Math.abs(axis.y) > .92 ? new T.Vector3(1, 0, 0) : up.clone().cross(axis).normalize();
  const z = x.clone().cross(axis).normalize();
  x.copy(axis).cross(z).normalize();
  const first = surface.coordinates.length / 3;
  for (const [point, radius, flex] of [[a, r0, rootFlex], [b, r1, tipFlex]] as const) {
    for (let j = 0; j < sides; j++) {
      const angle = tau * j / sides;
      const grain = radius * (1 + .052 * Math.cos(3 * angle + a.x));
      const p = point.clone().addScaledVector(x, grain * Math.cos(angle)).addScaledVector(z, grain * Math.sin(angle));
      surface.vertex(p, tint, .86 + .15 * Math.sin(3 * angle + point.x * .1), flex);
    }
  }
  for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    surface.quad(first + j, first + sides + j, first + sides + k, first + k);
  }
}

export function addGardenTrees(scene: T.Scene, planters: Parts, wind: T.IUniform<number>) {
  const wood = new PlantSurface(), leaves = new PlantSurface();
  const locations = [
    [907, 590, 3.2], [1164, 701, 3.4], [200, 342, 3.8], [635, 396, 4.3],
    [1000, 254, 3.8], [1314, 416, 4.3], [173, 748, 3.8],
  ];
  for (const [index, [px, pz, height]] of locations.entries()) {
    let seed = 2187 + index * 412;
    const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
    const { x, y: z } = sheetPoint(px, pz);
    const potted = index < 2;
    const foot = new T.Vector3(x, potted ? .18 : -.055, z);
    if (potted) {
      planters.add("pole", "#a9a393", new T.Vector3(x, .13, z), new T.Vector3(1.35, .07, 1.35));
      planters.add("pole", "#564b3c", new T.Vector3(x, .17, z), new T.Vector3(1.18, .025, 1.18));
    }
    function offset(from: T.Vector3, yaw: number, radius: number, rise: number) {
      return from.clone().add(new T.Vector3(Math.cos(yaw) * radius, rise, Math.sin(yaw) * radius).multiplyScalar(height));
    }
    const lean = random() * tau;
    const collar = offset(foot, lean, .008, .09);
    const fork = offset(foot, lean, .026, .34);
    const leader = offset(fork, lean + 1.6 * (random() - .5), .085, .55);
    const forkFlex = .06, leaderFlex = .47;
    stem(wood, foot, collar, height * .042, height * .028, 10, bark, [0, .007]);
    stem(wood, collar, fork, height * .028, height * .021, 10, bark, [.007, forkFlex]);
    stem(wood, fork, leader, height * .022, height * .005, 8, bark, [forkFlex, leaderFlex]);
    const crown = .86 + .25 * random();
    for (let j = 0; j < 10; j++) {
      const level = (j + .52 * random()) / 10;
      const yaw = lean + j * 2.4 + .52 * (random() - .5);
      const root = fork.clone().lerp(leader, level);
      const rootFlex = T.MathUtils.lerp(forkFlex, leaderFlex, level);
      const spread = crown * (.10 + .19 * Math.sin((.21 + .77 * level) * Math.PI)) * (.81 + .36 * random());
      const crook = offset(root, yaw, spread * .64, .17 - .09 * level);
      const crookFlex = rootFlex + .21;
      stem(wood, root, crook, (.016 - .009 * level) * height, .007 * height, 7, bark, [rootFlex, crookFlex]);
      for (let k = -1; k <= 1; k++) {
        const direction = yaw + k * .82 + .58 * (random() - .5);
        const outer = offset(crook, direction, spread * (.34 + random() * .35), .016 + .16 * random());
        const outerFlex = crookFlex + .24;
        stem(wood, crook, outer, height * .007, height * .003, 5, shoots, [crookFlex, outerFlex]);
        // Alternating sprays let light through between the primary branches.
        for (let n = 0; n < 8; n++) {
          const bearing = direction + (n - 3.5) * .78 + .51 * random();
          const station = .07 + (n + .32 * random()) * .126;
          const origin = crook.clone().lerp(outer, station);
          const originFlex = T.MathUtils.lerp(crookFlex, outerFlex, station);
          const twig = offset(origin, bearing, .061 + random() * .113, .14 * random() - .09);
          const twigFlex = originFlex + .25;
          stem(wood, origin, twig, .0028 * height, .0012 * height, 4, shoots, [originFlex, twigFlex]);
          for (let s = 0; s < 8; s++) {
            const progress = (s + .27 + .46 * random()) / 8;
            const leafBase = origin.clone().lerp(twig, progress);
            const length = height * (.040 + .038 * random()) * (1.20 - .34 * progress);
            const tone = Math.min(4, Math.floor(random() * 3 + level + 1.2 * progress));
            const heading = bearing + (s % 2 ? 1 : -1) * (.62 + .83 * random());
            const along = new T.Vector3(Math.cos(heading), .65 - 1.46 * random(), Math.sin(heading)).normalize();
            const across = new T.Vector3(-along.z, 1.65 * (random() - .5), along.x).normalize();
            const control = leafBase.clone().addScaledVector(along, length * .59);
            control.y += length * .18;
            const tip = leafBase.clone().addScaledVector(along, length);
            tip.y -= length * .22;
            const rootFlex = T.MathUtils.lerp(originFlex, twigFlex, progress);
            leaves.leaf(leafBase, control, tip, across, length * (.16 + .08 * random()), greens[tone], {
              rootFlex, tipFlex: rootFlex + .17, flutter: length * 1.45, phase: bearing * 1.63 + s * 2.76 + index * 5,
            });
          }
        }
      }
    }
  }
  scene.add(wood.mesh("Garden tree trunks and branching twigs", T.FrontSide, wind, true),
    leaves.mesh("Garden tree foliage", T.DoubleSide, wind));
}
