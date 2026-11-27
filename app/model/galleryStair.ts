import * as T from "three";
import { Parts, levelHeight, type Floor } from "./geometry";
import { pavilionStair as stair } from "./pavilionStairLayout";
import { shopFloorHeight } from "./retailFrontages";
import { facadeFinish } from "./siteMaterials";

const lower = shopFloorHeight.ground;
const upper = shopFloorHeight.first;
const middle = (lower + upper) / 2;
const flight = stair.lastTread - stair.firstTread;
const wall = .13;
const centreGap = .085;

/** Foot height on the two flights. Null marks a wall or rail within the stair bay. */
export function galleryStairHeight(x: number, z: number, previousHeight: number): number | null | undefined {
  if (x < stair.left || x > stair.right || z < stair.entrance || z > stair.back) return;
  if (x < stair.left + .27 || x > stair.right - .27 || z > stair.back - .25) return null;
  if (z < stair.firstTread) return previousHeight > middle ? upper : lower;
  if (z > stair.lastTread + .15) return middle;
  if (Math.abs(x - stair.centre) < .18) return null;
  const progress = Math.min(1, (z - stair.firstTread) / flight);
  return x < stair.centre ? T.MathUtils.lerp(lower, middle, progress) : T.MathUtils.lerp(upper, middle, progress);
}

export function buildGalleryStair(parent: T.Group, floor: Floor) {
  const group = new T.Group();
  group.name = floor === "ground" ? "Indoor pavilion staircase" : "Pavilion stair landing";
  parent.add(group);
  const parts = new Parts();
  const stone = "#d5c6aa";
  const dark = "#4a514b";
  const metal = "#8c7550";
  const width = stair.right - stair.left;
  const bottom = shopFloorHeight[floor];
  const ceiling = floor === "ground" ? upper : upper + levelHeight - .65;
  const roomDepth = stair.back - stair.entrance;
  const roomCentre = (stair.entrance + stair.back) / 2;
  for (const x of [stair.left + wall / 2, stair.right - wall / 2]) {
    parts.box(facadeFinish.lining, x, (bottom + ceiling) / 2, roomCentre, wall, ceiling - bottom, roomDepth);
    parts.box("#a39983", x, bottom + .07, roomCentre, wall + .022, .14, roomDepth);
  }
  parts.box(facadeFinish.edge, stair.centre, (bottom + ceiling) / 2, stair.back - wall / 2, width, ceiling - bottom, wall);
  parts.box(facadeFinish.lining, stair.centre, bottom + 2.67, stair.entrance + .095, width, .53, .19);
  if (typeof document !== "undefined") {
    const label = document.createElement("canvas");
    label.width = 480;
    label.height = 96;
    const ink = label.getContext("2d")!;
    ink.fillStyle = "#273b31";
    ink.fillRect(0, 0, label.width, label.height);
    ink.fillStyle = "#f9edce";
    ink.font = "600 42px system-ui";
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillText(floor === "ground" ? "STAIRS  ↑" : "STAIRS  ↓", 240, 48);
    const map = new T.CanvasTexture(label);
    map.colorSpace = T.SRGBColorSpace;
    const sign = new T.Mesh(new T.PlaneGeometry(1.13, .226), new T.MeshBasicMaterial({ map }));
    sign.rotation.y = Math.PI;
    sign.position.set(stair.centre, bottom + 2.62, stair.entrance - .003);
    group.add(sign);
  }
  const lamp = new T.Mesh(new T.BoxGeometry(width - .55, .025, .10),
    new T.MeshBasicMaterial({ color: "#fff1ce", toneMapped: false }));
  lamp.position.set(stair.centre, bottom + 2.42, stair.entrance + .31);
  group.add(lamp);

  function rail(x: number, a: number, b: number, y0: number, y1: number) {
    parts.rod(metal, new T.Vector3(x, y0 + .94, a), new T.Vector3(x, y1 + .94, b), .027);
    const spans = Math.ceil(Math.abs(b - a) / .75);
    for (let i = 0; i <= spans; i++) {
      const z = T.MathUtils.lerp(a, b, i / spans), y = T.MathUtils.lerp(y0, y1, i / spans);
      parts.box(dark, x, y + .46, z, .034, .92, .034);
    }
  }
  if (floor === "ground") {
    const material = new T.MeshStandardMaterial({ color: stone, roughness: .87 });
    const count = 10, tread = flight / count, rise = (middle - lower) / count;
    function makeFlight(left: number, right: number, start: number, base: number, direction: 1 | -1) {
      const profile = new T.Shape().moveTo(0, 0);
      for (let step = 0; step < count; step++) {
        const run = step * tread, height = (step + 1) * rise;
        profile.lineTo(run, height).lineTo(run + tread, height);
        parts.box("#ac936c", (left + right) / 2, base + height + .0015, start + direction * (run + .034),
          right - left - .045, .004, .035);
      }
      profile.lineTo(flight, count * rise - .17).lineTo(0, -.17).closePath();
      const mesh = new T.Mesh(new T.ExtrudeGeometry(profile, { depth: right - left, bevelEnabled: false }), material);
      mesh.position.set(direction === 1 ? right : left, base, start);
      mesh.rotation.y = -direction * Math.PI / 2;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const left = stair.left + wall, right = stair.right - wall;
    makeFlight(left, stair.centre - centreGap, stair.firstTread, lower, 1);
    makeFlight(stair.centre + centreGap, right, stair.lastTread, middle, -1);
    const landingDepth = stair.back - wall - stair.lastTread;
    // The entry landing meets the gallery's walkway at the shopfront line without overlapping it.
    const entryDepth = stair.firstTread - stair.entrance;
    parts.box(stone, stair.centre, middle - .085, stair.lastTread + landingDepth / 2, right - left, .17, landingDepth);
    parts.box(stone, stair.centre, lower - .05, stair.firstTread - entryDepth / 2, right - left, .10, entryDepth);
    rail(stair.centre - centreGap, stair.firstTread, stair.lastTread + .10, lower + .08, middle);
    rail(stair.centre + centreGap, stair.lastTread + .10, stair.firstTread, middle, upper);
  } else {
    const entryDepth = stair.firstTread - stair.entrance;
    parts.box(stone, stair.centre, upper - .023, stair.firstTread - entryDepth / 2, width - wall * 2, .046, entryDepth);
    // The returning flight arrives on the right. A guard closes the void on the left.
    for (const height of [.38, .67, .98]) {
      const a = new T.Vector3(stair.left + wall, upper + height, stair.firstTread - .045);
      const b = new T.Vector3(stair.centre + centreGap, upper + height, a.z);
      parts.rod(height === .98 ? metal : dark, a, b, height === .98 ? .029 : .013);
    }
    for (const x of [stair.left + .17, (stair.centre + stair.left) / 2, stair.centre + centreGap]) {
      parts.box(dark, x, upper + .48, stair.firstTread - .045, .034, .96, .034);
    }
  }
  parts.build(group);
}
