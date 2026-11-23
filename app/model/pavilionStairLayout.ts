import { Vector2 } from "three";
import { sheetPoint } from "./geometry";

// Stair bay between 41 and 42 downstairs and 152 and 153 upstairs.
const left = sheetPoint(1067.2, 610);
const right = sheetPoint(1097.7, 610);

export const pavilionStair = {
  left: left.x,
  right: right.x,
  centre: (left.x + right.x) / 2,
  galleryEdge: left.y,
  entrance: left.y + 1.9,
  firstTread: left.y + 2.70,
  lastTread: left.y + 5.25,
  back: left.y + 6.50,
};

export const pavilionStairShops = { ground: [41, 42], first: [152, 153] } as const;

export function stairRectangle(front: number, back: number, inset = 0) {
  return [
    new Vector2(pavilionStair.left + inset, front),
    new Vector2(pavilionStair.right - inset, front),
    new Vector2(pavilionStair.right - inset, back),
    new Vector2(pavilionStair.left + inset, back),
  ];
}
