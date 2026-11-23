import * as T from "three";
import { sheetPoint } from "./geometry";

const foot = 0.3048;
export const entranceLength = 71 * foot;
export const entranceWidth = 40 * foot;

// The two building tips are the inner threshold marked in the site photograph.
const leftTip = sheetPoint(283, 772);
const rightTip = sheetPoint(391, 820);
export const entranceOrigin = leftTip.clone().lerp(rightTip, 0.5);
const right = rightTip.clone().sub(leftTip).normalize();
const outward = new T.Vector2(-right.y, right.x);
export const entranceYaw = Math.atan2(outward.x, outward.y);

/** Metres from the threshold, positive x on a visitor's right when walking in. */
export function entrancePoint(x: number, outwardMetres: number) {
  return entranceOrigin.clone().addScaledVector(right, x).addScaledVector(outward, outwardMetres);
}

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
