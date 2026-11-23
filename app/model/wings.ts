import * as T from "three";
import { sheetPoint } from "./geometry";

type Point = [number, number];
type Segment = Point | { end: Point; controls: [Point, Point] };
type WingDrawing = { start: Point; back: Segment[]; frontage: Segment[] };

function curve(cx: number, cy: number, dx: number, dy: number, x: number, y: number): Segment {
  return { end: [x, y], controls: [[cx, cy], [dx, dy]] };
}

// Opposing gallery edges on the two sides of the western passage, in perimeter order.
const westPassage = {
  wing: [[267, 485], [204, 562]],
  pavilion: [[234, 579], [292, 508]],
} satisfies Record<"wing" | "pavilion", [Point, Point]>;

// Roof perimeters trace the external walls and the continuous public galleries on the site drawing.
// Shop boundaries underneath are loaded separately from the measured floor SVGs.
const wings: WingDrawing[] = [
  {
    start: [391, 820],
    back: [
      [645, 826], [928, 822], [1360, 824], [1393, 824], [1395, 829], [1421, 825],
      [1347, 479], [946, 479], [946, 161], [887, 157],
    ],
    frontage: [
      [875, 157], [875, 505], curve(875, 541, 897, 562, 927, 562),
      [1229, 562], curve(1243, 562, 1251, 576, 1251, 591),
      [1251, 713], curve(1251, 732, 1243, 739, 1228, 739), [932, 739],
      curve(905, 739, 891, 759, 838, 759),
      curve(775, 759, 744, 736, 710, 704),
      curve(677, 674, 638, 660, 591, 660),
      curve(534, 660, 490, 692, 461, 721),
      curve(446, 735, 434, 739, 417, 739), [399, 739], [391, 820],
    ],
  },
  {
    start: [283, 772],
    back: [
      [98, 616], [177, 441], [195, 447], [214, 377], [434, 419], [436, 414],
      [688, 469], [725, 293], [782, 304],
    ],
    frontage: [
      [754, 449], curve(748, 493, 729, 527, 694, 537),
      curve(673, 544, 650, 542, 621, 536),
      [312, 476], curve(291, 472, 280, 470, ...westPassage.wing[0]), westPassage.wing[1],
      curve(188, 580, 188, 591, 206, 606), [292, 677],
      curve(304, 686, 304, 694, 301, 705), [283, 772],
    ],
  },
  {
    start: [930, 610],
    back: [],
    frontage: [
      [1179, 610], curve(1191, 610, 1197, 617, 1197, 628), [1197, 674],
      curve(1197, 685, 1191, 692, 1179, 692), [930, 692],
      curve(941, 665, 940, 637, 930, 610),
    ],
  },
  {
    start: westPassage.pavilion[1],
    back: [],
    frontage: [
      curve(299, 498, 305, 497, 314, 504), [380, 559],
      curve(391, 568, 392, 578, 383, 589), [331, 653],
      curve(322, 666, 314, 666, 300, 655), [238, 605],
      curve(227, 597, 226, 588, ...westPassage.pavilion[0]), westPassage.pavilion[1],
    ],
  },
];

export type Boundary = { points: T.Vector2[]; publicEdge: boolean[]; insets: T.Vector2[] };

function sample(drawing: WingDrawing): Boundary {
  const start = sheetPoint(...drawing.start);
  const points = [start];
  const publicEdge: boolean[] = [];
  for (const [segments, isPublic] of [[drawing.back, false], [drawing.frontage, true]] as const) {
    for (const segment of segments) {
      const from = points[points.length - 1];
      const straight = Array.isArray(segment);
      const end = sheetPoint(...(straight ? segment : segment.end));
      const section = straight
        ? new T.LineCurve(from, end)
        : new T.CubicBezierCurve(from, sheetPoint(...segment.controls[0]), sheetPoint(...segment.controls[1]), end);
      const steps = Math.max(1, Math.ceil(section.getLength() / 0.84));
      for (let i = 1; i <= steps; i++) {
        points.push(section.getPointAt(i / steps));
        publicEdge.push(isPublic);
      }
    }
  }
  points.pop(); // the last run lands exactly on the first vertex
  return boundary(points, publicEdge);
}

function boundary(points: T.Vector2[], publicEdge: boolean[]): Boundary {
  const winding = Math.sign(T.ShapeUtils.area(points));
  const normals = points.map((p, i) => {
    const next = points[(i + 1) % points.length];
    return new T.Vector2(p.y - next.y, next.x - p.x).normalize().multiplyScalar(winding);
  });
  const insets = normals.map((normal, i) => {
    const bisector = normal.clone().add(normals[(i + points.length - 1) % points.length]).normalize();
    return bisector.multiplyScalar(1 / Math.max(0.5, bisector.dot(normal)));
  });
  return { points, publicEdge, insets };
}

export const wingBoundaries = wings.map(sample);

// Keep the shop fronts on their measured outlines. The slabs, parapets and rails
// follow one continuous perimeter around the joined west wing and pavilion.
function outsidePassage(wing: Boundary, edge: [Point, Point]) {
  const [start, end] = edge.map(p => sheetPoint(...p));
  const first = wing.points.findIndex(p => p.distanceToSquared(end) < 1e-10);
  const last = wing.points.findIndex(p => p.distanceToSquared(start) < 1e-10);
  if (first < 0 || last < 0) throw new Error("Western gallery edge is missing from its building outline.");
  const points = [wing.points[first]];
  const publicEdge = [];
  for (let i = first; i !== last;) {
    publicEdge.push(wing.publicEdge[i]);
    i = (i + 1) % wing.points.length;
    points.push(wing.points[i]);
  }
  publicEdge.push(true); // exposed end of the link to the opposite gallery
  return { points, publicEdge };
}

const [eastWing, westWing, eastPavilion, westPavilion] = wingBoundaries;
const outerWing = outsidePassage(westWing, westPassage.wing);
const outerPavilion = outsidePassage(westPavilion, westPassage.pavilion);
const joinedWest = boundary(
  outerWing.points.concat(outerPavilion.points),
  outerWing.publicEdge.concat(outerPavilion.publicEdge),
);
export const shellBoundaries = [eastWing, joinedWest, eastPavilion];

// Give walkers clearance from the two exposed ends and overlap the walkable
// gallery on either side of the link so the navigation masks meet at both mouths.
function landing(edge: [Point, Point], opposite: [Point, Point]) {
  const ends = edge.map(p => sheetPoint(...p));
  return ends.map((end, i) => {
    const alongGallery = ends[1 - i].clone().sub(end).normalize();
    const intoGallery = end.clone().sub(sheetPoint(...opposite[1 - i])).normalize();
    return end.clone().addScaledVector(alongGallery, 0.32).addScaledVector(intoGallery, 0.70);
  });
}

export const westPassageWalkway = [
  ...landing(westPassage.wing, westPassage.pavilion),
  ...landing(westPassage.pavilion, westPassage.wing),
];
