import { MathUtils, Vector3 } from "three";
import { cameraRoute, plan, type CameraRoute, type Shot } from "./cameraRoute";
import { boardOutline, entrancePoint } from "./entranceLayout";
import { entrancePalmTrunks } from "./entrancePalms";
import { wingBoundaries } from "./wings";
import { shopFloorHeight } from "./retailFrontages";

const upperEye = shopFloorHeight.first + 1.58;
const gallery = (x: number, z: number) => plan(x, z, upperEye);

const westWing = cameraRoute([
  { time: 0, eye: gallery(681, 531.8), look: plan(533, 509, 5.05), chapter: "West wing gallery" },
  { time: 5, eye: gallery(638, 530.4), look: plan(508, 504, 5.05) },
  { time: 13, eye: gallery(536, 511.3), look: plan(441, 547, 4.25) },
  { time: 21, eye: gallery(433, 491.5), look: plan(321, 470, 5.12) },
  { time: 28, eye: gallery(342, 473.6), look: plan(259, 491, 5.20) },
  { time: 33, eye: gallery(286, 465.6), look: plan(253, 497, 5.22), chapter: "West pavilion passage" },
  { time: 37, eye: gallery(265, 476.6), look: plan(261, 524, 5.22) },
  { time: 41, eye: gallery(246.6, 502.6), look: plan(284, 523, 5.23) },
  { time: 46, eye: gallery(269, 529.5), look: plan(340, 533, 5.16) },
  { time: 49, eye: gallery(291, 521.6), look: plan(308, 509, 5.12) },
  { time: 51, eye: gallery(304.5, 508.4), look: plan(347, 538, 5.13) },
  { time: 53, eye: gallery(321, 520.3), look: plan(497, 571, 4.38) },
]);

const eastWing = cameraRoute([
  { time: 0, eye: gallery(933.5, 553), look: plan(1118, 551, 5.22), chapter: "East wing gallery" },
  { time: 6, eye: gallery(994, 553.5), look: plan(1131, 604, 4.65) },
  { time: 14, eye: gallery(1095, 553.5), look: plan(1238, 568, 5.25) },
  { time: 23, eye: gallery(1209, 554), look: plan(1255, 594, 5.30) },
  { time: 26, eye: gallery(1235, 555), look: plan(1259, 609, 5.26) },
  { time: 29, eye: gallery(1252.5, 566.8), look: plan(1259, 639, 5.27) },
  { time: 33, eye: gallery(1259, 592), look: plan(1255, 665, 5.17) },
  { time: 40, eye: gallery(1259, 661), look: plan(1183, 719, 4.55) },
  { time: 45, eye: gallery(1258.5, 710), look: plan(1224, 748, 5.26), chapter: "South gallery" },
  { time: 49, eye: gallery(1246, 743), look: plan(1143, 747, 5.09) },
  { time: 54, eye: gallery(1199, 747), look: plan(1086, 715, 4.75) },
  { time: 63, eye: gallery(1088, 747), look: plan(929, 744, 5.12) },
  { time: 70, eye: gallery(1008, 747), look: plan(873, 652, 3.95), chapter: "Central courtyard overlook" },
  { time: 76, eye: gallery(948, 747), look: plan(832, 650, 3.04) },
]);

const pavilionShopTime = 22;
const pavilion = cameraRoute([
  { time: 0, eye: gallery(1102, 619), look: plan(1191, 631, 5.22), chapter: "Pavilion balcony" },
  { time: 6, eye: gallery(1134, 618.7), look: plan(1179, 608, 5.15) },
  { time: 11, eye: gallery(1147.69, 619), look: plan(1175, 626, 5.12), chapter: "Botanica flower shop" },
  { time: 14, eye: gallery(1147.69, 626.51), look: plan(1154, 645, 5.0) },
  { time: 16, eye: gallery(1147.69, 637.15), look: plan(1146, 649, 4.97) },
  { time: 19, eye: gallery(1147.69, 637.15), look: plan(1133.31, 638.68, 4.94) },
  { time: pavilionShopTime, eye: gallery(1147.69, 637.15), look: plan(1133, 642.1, 5.05) },
  { time: 25, eye: gallery(1147.69, 626.51), look: plan(1148, 643, 5.18) },
  { time: 28, eye: gallery(1147.69, 619), look: plan(1162, 626, 5.24) },
  { time: 32, eye: gallery(1175, 620), look: plan(1188, 631, 5.32) },
  { time: 35, eye: gallery(1184, 622), look: plan(1190, 656, 5.31) },
  { time: 38, eye: gallery(1188, 630), look: plan(1188, 681, 5.32) },
  { time: 43, eye: gallery(1188, 663), look: plan(1182, 694, 5.13) },
  { time: 46, eye: gallery(1187, 673), look: plan(1164, 702, 5.03) },
  { time: 49, eye: gallery(1183, 680), look: plan(1131, 694, 5.08) },
  { time: 52, eye: gallery(1169, 682.8), look: plan(1083, 687, 5.24) },
  { time: 58, eye: gallery(1106, 683.5), look: plan(998, 748, 4.34), chapter: "Market from the balcony" },
  { time: 65, eye: gallery(1032, 683.5), look: plan(830, 676, 4.25) },
  { time: 69, eye: gallery(986, 683.5), look: plan(744, 615, 4.63) },
  { time: 71, eye: gallery(954, 683.5), look: plan(806, 633, 4.35) },
  { time: 73, eye: gallery(945.8, 669), look: plan(790, 649, 4.30) },
]);

const openingDuration = 10;
const westEnd = openingDuration + westWing.duration;
const eastEnd = westEnd + eastWing.duration;
const sitePoints = [
  ...boardOutline.map(p => new Vector3(p.x, -1.05, p.y)),
  ...wingBoundaries.flatMap(wing => wing.points.map(p => new Vector3(p.x, 9.60, p.y))),
  ...entrancePalmTrunks.map(trunk => {
    const p = entrancePoint(trunk.x, trunk.z);
    return new Vector3(p.x, 7.50, p.y);
  }),
];

// Fit each projected axis and centre it in the frame. An off-centre entrance
// plinth otherwise pushes the mall towards the far half of the image.
function overviewMark(time: number, orbitAngle: number, aspect: number): Shot {
  const wide = MathUtils.smoothstep(aspect, .75, 1.85);
  const azimuth = orbitAngle - (1 - wide) * 1.02;
  const direction = new Vector3(Math.sin(azimuth), MathUtils.lerp(1.30, .98, wide), Math.cos(azimuth)).normalize();
  const right = new Vector3(direction.z, 0, -direction.x).normalize();
  const up = direction.clone().cross(right);
  const fov = MathUtils.lerp(74, 60, MathUtils.smoothstep(aspect, 1, 1.85));
  const height = Math.tan(MathUtils.degToRad(fov / 2));
  function span(axis: Vector3, halfAngleTangent: number) {
    const slope = halfAngleTangent * .91;
    let near = -Infinity, far = Infinity;
    for (const p of sitePoints) {
      const position = p.dot(axis), depth = p.dot(direction) * slope;
      near = Math.max(near, position + depth);
      far = Math.min(far, position - depth);
    }
    return { distance: (near - far) / (2 * slope), offset: (near + far) / 2 };
  }
  const x = span(right, height * aspect), y = span(up, height);
  const look = right.multiplyScalar(x.offset).addScaledVector(up, y.offset);
  const eye = look.clone().addScaledVector(direction, Math.max(x.distance, y.distance));
  return { time, eye: eye.toArray(), look: look.toArray() };
}

function fitOpening(aspect: number) {
  return cameraRoute([
    { ...overviewMark(0, .20, aspect), chapter: "Whole-mall panorama" },
    overviewMark(3, .10, aspect), overviewMark(7, -.07, aspect),
    overviewMark(openingDuration, -.17, aspect),
  ]);
}

let fittedAspect = 1.85;
let opening = fitOpening(fittedAspect);
export const firstFloorWalkthrough: CameraRoute & { shopTime: number } = {
  shopTime: eastEnd + pavilionShopTime,
  duration: eastEnd + pavilion.duration,
  chapters: [
    ...opening.chapters,
    ...westWing.chapters.map(chapter => ({ ...chapter, time: chapter.time + openingDuration })),
    ...eastWing.chapters.map(chapter => ({ ...chapter, time: chapter.time + westEnd })),
    ...pavilion.chapters.map(chapter => ({ ...chapter, time: chapter.time + eastEnd })),
  ],
  sample(seconds, aspect = 1.85) {
    // Separate camera passes keep each walk on a connected upper deck.
    if (seconds >= eastEnd) return pavilion.sample(seconds - eastEnd);
    if (seconds >= westEnd) return eastWing.sample(seconds - westEnd);
    if (seconds >= openingDuration) return westWing.sample(seconds - openingDuration);
    if (Number.isFinite(aspect) && aspect > 0 && aspect !== fittedAspect) {
      fittedAspect = aspect;
      opening = fitOpening(aspect);
    }
    return { ...opening.sample(seconds), aerial: true };
  },
};
