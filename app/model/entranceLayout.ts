import * as T from "three";
import { sheetPoint } from "./geometry";
import { wingBoundaries } from "./wings";

const foot = 0.3048;
export const entranceLength = 71 * foot;
export const entranceWidth = 40 * foot;

// The two building tips are the inner threshold marked in the site photograph.
const [eastWing, westWing] = wingBoundaries;
const leftTip = westWing.points[0];
const rightTip = eastWing.points[0];
export const entranceOrigin = leftTip.clone().lerp(rightTip, 0.5);
const right = rightTip.clone().sub(leftTip).normalize();
const outward = new T.Vector2(-right.y, right.x);
export const entranceYaw = Math.atan2(outward.x, outward.y);

/** Metres from the threshold, positive x on a visitor's right when walking in. */
export function entrancePoint(x: number, outwardMetres: number) {
  return entranceOrigin.clone().addScaledVector(right, x).addScaledVector(outward, outwardMetres);
}

// Intersect the wall and its paving with the real, angled back face of the east wing.
const rearEdge = eastWing.points[1].clone().sub(rightTip);
const tipOffset = rightTip.distanceTo(entranceOrigin);
export function eastFacadeAt(x: number) {
  return (x - tipOffset) * rearEdge.dot(outward) / rearEdge.dot(right);
}

export const fountainWallFace = 8.56;
export const fountainWallEnd = entranceLength - .18;
const innerEnd = eastFacadeAt(fountainWallFace);
const endMargin = .38, gap = .78;
export const entranceSign = { z: (innerEnd + fountainWallEnd) / 2, width: 4.08, height: 2.25 };
const panelWidth = (fountainWallEnd - innerEnd - 2 * endMargin - entranceSign.width - 6 * gap) / 6;
const spacing = panelWidth + gap;
const firstOffset = (entranceSign.width + panelWidth) / 2 + gap;
export const fountainPanels = [-3, -2, -1, 1, 2, 3].map(index => ({
  z: entranceSign.z + Math.sign(index) * (firstOffset + (Math.abs(index) - 1) * spacing),
  width: panelWidth,
}));
export const fountainGaps = [...fountainPanels.slice(0, 3), entranceSign, ...fountainPanels.slice(3, 5)]
  .map(bay => bay.z + bay.width / 2 + gap / 2);

// The projecting piece of the display base follows the new road and its two verges.
// Intersect its sides with the original base, so all three plinth layers have one perimeter.
export const entranceVerge = { left: -10.0, right: 10.15 };
const formerEdge = sheetPoint(0, 850).y;
function meetsOriginalBoard(side: number) {
  return entrancePoint(side, (formerEdge - entrancePoint(side, 0).y) / outward.y);
}

export const boardOutline = [
  sheetPoint(84, 128), sheetPoint(1436, 128), sheetPoint(1442, 134), sheetPoint(1442, 844),
  sheetPoint(1436, 850), meetsOriginalBoard(entranceVerge.right),
  entrancePoint(entranceVerge.right, entranceLength - .24), entrancePoint(entranceVerge.right - .24, entranceLength),
  entrancePoint(entranceVerge.left + .24, entranceLength), entrancePoint(entranceVerge.left, entranceLength - .24),
  meetsOriginalBoard(entranceVerge.left), sheetPoint(84, 850), sheetPoint(78, 844), sheetPoint(78, 134),
];
