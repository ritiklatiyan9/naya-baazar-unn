import * as T from "three";
import { sheetPoint } from "./geometry";
import { entranceLength, entrancePoint } from "./entranceLayout";

/** Surveyed axis between the paved wings, shared by the lane markings and traffic. */
export function marketRoadCenter() {
  const axis = [[337, 773], [344, 731], [355, 693], [374, 651], [403, 617], [446, 592],
    [493, 578], [544, 574], [602, 583], [666, 585], [722, 575], [773, 551],
    [804, 517], [822, 474], [830, 420], [830, 359], [829, 300], [829, 240], [832, 187]];
  return new T.CatmullRomCurve3(axis.map(([x, z]) => onGround(sheetPoint(x, z))));
}

function onGround(point: T.Vector2) {
  return new T.Vector3(point.x, 0, point.y);
}

function transition(start: T.Vector3, end: T.Vector3, from: T.Vector3, to: T.Vector3) {
  const handle = start.distanceTo(end) / 3;
  return new T.CubicBezierCurve3(start, start.clone().addScaledVector(from, handle),
    end.clone().addScaledVector(to, -handle), end);
}

export function roadCenterMarkings(elevation: number) {
  const road = marketRoadCenter();
  const entrance = new T.LineCurve3(onGround(entrancePoint(0, entranceLength)), onGround(entrancePoint(0, 0)));
  const path = new T.CurvePath<T.Vector3>();
  path.add(entrance);
  path.add(transition(entrance.v2, road.getPoint(0), entrance.getTangent(1), road.getTangent(0)));
  path.add(road);
  path.add(transition(road.getPoint(1), onGround(sheetPoint(836, 128)), road.getTangent(1), new T.Vector3(0, 0, -1)));

  const positions: number[] = [], indices: number[] = [];
  const length = path.getLength(), dash = 2.3, gap = 2.25, halfWidth = .09;
  const sections = Math.ceil(dash / .38);
  for (let start = 1.6; start + dash < length - 2.8; start += dash + gap) {
    for (let i = 0; i <= sections; i++) {
      const u = (start + dash * i / sections) / length;
      const point = path.getPoint(u), tangent = path.getTangent(u);
      const dx = tangent.z * halfWidth, dz = -tangent.x * halfWidth;
      const a = positions.length / 3;
      positions.push(point.x + dx, elevation, point.z + dz, point.x - dx, elevation, point.z - dz);
      if (i > 0) indices.push(a - 2, a - 1, a, a - 1, a + 1, a);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const markings = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: "#e8e6df", roughness: .97 }));
  markings.name = "White carriageway center markings";
  markings.receiveShadow = true;
  return markings;
}
