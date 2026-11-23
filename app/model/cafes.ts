import * as T from "three";
import { Parts, type Unit } from "./geometry";
import { cafeShopIds } from "./marketPlaces";
import { retailBays } from "./retailFrontages";
import type { PersonPose } from "./shoppers";
import { wingBoundaries } from "./wings";

const pavingY = .11;
const tableHeight = .738;
const wood = "#ab815b";
const porcelain = "#f2e8d7";
const sage = "#758578";
const rose = "#aa7766";

// Each table is on the apron outside the gallery and to one side of the shop entrance.
// The opposing chairs sit perpendicular to the frontage, leaving the approach to the door open.
const terraces = [
  { shop: cafeShopIds.coffee, wing: 2, along: [.65, 2.72], inset: -1.45, bakery: false },
  { shop: cafeShopIds.bakery, wing: 0, along: [1.05], inset: -1.40, bakery: true },
];

function terraceTables(units: Unit[]) {
  return terraces.flatMap(({ shop, wing, along, inset, bakery }) => {
    const bay = retailBays(wingBoundaries[wing], units).find(bay => bay.id === shop);
    if (!bay) return [];
    return along.map((u, i) => {
      const center = bay.at(u, inset);
      const inside = bay.at(u, inset + .4).sub(center).normalize();
      return { center, radius: .98, heading: Math.atan2(inside.x, inside.y), bakery, shaded: !bakery && i === 1 };
    });
  });
}

export function cafeTableFootprints(groundUnits: Unit[]) {
  return terraceTables(groundUnits).map(({ center, radius }) => ({ center, radius }));
}

/** A compact eight-panel café parasol. All fabric and the short hanging hems share one draw. */
function parasol(group: T.Group, parts: Parts, center: T.Vector2, yaw: number) {
  const verts: number[] = [], colors: number[] = [];
  const peak = new T.Vector3(center.x, pavingY + 2.57, center.y);
  function point(a: number, r: number, h: number) {
    return new T.Vector3(center.x + Math.sin(a) * r, pavingY + h, center.y + Math.cos(a) * r);
  }
  const triangle = (color: T.Color, a: T.Vector3, b: T.Vector3, c: T.Vector3) => {
    for (const v of [a, b, c]) { verts.push(v.x, v.y, v.z); colors.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < 8; i++) {
    const angle = yaw + i * Math.PI / 4;
    const a = point(angle, .90, 2.23), b = point(angle + Math.PI / 4, .90, 2.23);
    const mid = a.clone().lerp(b, .5);
    mid.y -= .027;
    const linen = new T.Color(i % 2 ? "#91a397" : "#e3dcca");
    triangle(linen, peak, a, mid);
    triangle(linen, peak, mid, b);
    const hemA = a.clone(), hemMid = mid.clone(), hemB = b.clone();
    hemA.y -= .062; hemMid.y -= .083; hemB.y -= .062;
    triangle(linen, a, hemA, mid);
    triangle(linen, mid, hemA, hemMid);
    triangle(linen, mid, hemMid, b);
    triangle(linen, b, hemMid, hemB);
    parts.rod("#a08a70", point(angle, .06, 2.48), point(angle, .88, 2.215), .009);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const canopy = new T.Mesh(geo, new T.MeshStandardMaterial({vertexColors:true, side:T.DoubleSide, roughness:.92}));
  canopy.name = "Striped café parasol";
  canopy.castShadow = canopy.receiveShadow = true;
  group.add(canopy);
  parts.rod("#9b7957", new T.Vector3(center.x, pavingY + tableHeight, center.y), peak, .018);
}

/** The seats and meals share the street's existing instanced shopper rig and animation clock. */
export function buildCafes(parent: T.Group, groundUnits: Unit[]) {
  const group = new T.Group();
  group.name = "Courtyard café terraces";
  parent.add(group);
  const parts = new Parts();
  const diners: PersonPose[] = [];
  for (const {center, heading, bakery, shaded} of terraceTables(groundUnits)) {
    // A table's local +Z points towards the shop. Chair positions, place settings and diners use this frame.
    const at = (x: number, y: number, z: number) => new T.Vector3(
      center.x + Math.cos(heading) * x + Math.sin(heading) * z, pavingY + y,
      center.y - Math.sin(heading) * x + Math.cos(heading) * z);
    function piece(shape: Parameters<Parts["add"]>[0], tint: string, x: number, y: number, z: number,
      width: number, height: number, depth: number, turn = 0) {
      parts.add(shape, tint, at(x,y,z), new T.Vector3(width,height,depth),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0), heading + turn));
    }
    const finish = bakery ? rose : sage;
    const frame = bakery ? "#81654f" : "#596b61";
    piece("pole", frame, 0, .032, 0, .42, .05, .42);
    piece("pole", frame, 0, .375, 0, .065, .665, .065);
    piece(bakery ? "box" : "pole", bakery ? wood : "#c9b99d", 0, tableHeight-.024, 0, .73, .046, .73);
    piece(bakery ? "box" : "pole", bakery ? "#e4c79f" : "#e6dbca", 0, tableHeight, 0, .74, .018, .74);
    if (shaded) parasol(group, parts, center, heading + .18);
    else {
      piece("round", finish, -.035, tableHeight+.066, 0, .083, .122, .083);
      for (const side of [-1,1]) {
        parts.rod("#747d5c", at(-.038, tableHeight+.096, 0), at(-.038+side*.038, tableHeight+.20, .013*side), .004);
        piece("round", bakery ? "#cb937e" : "#95aa80", -.038+side*.038, tableHeight+.20, .013*side, .038,.033,.038);
      }
    }
    for (const side of [-1, 1]) {
      const chairZ = side * .64;
      const chairTurn = side === 1 ? Math.PI : 0;
      // Slightly flared legs, exposed joinery, curved seats and a two-slat bistro back.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.rod(frame, at(sx*.179,.012,chairZ+sz*.165), at(sx*.145,.418,chairZ+sz*.143), .014);
      }
      piece("box", wood, 0, .425, chairZ, .397,.046,.364, chairTurn);
      piece("round", finish, 0,.453,chairZ,.415,.050,.386, chairTurn);
      for (const sx of [-1, 1]) parts.rod(frame,
        at(sx*.16,.414,chairZ+side*.128), at(sx*.166,.83,chairZ+side*.20), .013);
      for (const y of [.679,.777]) piece("box", bakery ? "#b38b67" : "#879686", 0,y,chairZ+side*(y*.165+.062),
        .367,.066,.033,chairTurn);

      const plateZ = side * .204;
      piece("pole", porcelain, -.046, tableHeight+.018, plateZ, .206,.012,.206);
      if (bakery) {
        // A crescent is assembled from small tapered, overlapped baked sections.
        for (let j=-2;j<=2;j++) {
          const offset = Math.abs(j);
          piece("round", j % 2 ? "#c38d55" : "#daa96a", -.044+j*.022,tableHeight+.043,
            plateZ+side*offset*offset*.008,.062-offset*.006,.046-offset*.008,.075-offset*.007,-side*j*.31);
        }
      } else {
        piece("round","#c48a58",-.046,tableHeight+.043,plateZ,.118,.044,.095);
        piece("round","#809262",-.047,tableHeight+.052,plateZ,.124,.019,.104);
        piece("round","#d2a66f",-.046,tableHeight+.074,plateZ,.116,.047,.094);
      }
      const napkinX = side*.17;
      piece("box", "#e5d8bf", napkinX,tableHeight+.014,plateZ,.082,.006,.128,.12*side);
      piece("box", "#a49f91", napkinX,tableHeight+.020,plateZ,.011,.005,.11,.12*side);
      // Alternate a vacant saucer for the cup in hand and a filled cup at the other setting.
      piece("pole", porcelain, .158,tableHeight+.018,side*.047,.12,.012,.12);
      if (diners.length % 2 === 1) {
        piece("pole", "#dfc9a9", .158,tableHeight+.057,side*.047,.075,.065,.075);
        piece("pole", "#876046", .158,tableHeight+.091,side*.047,.064,.003,.064);
      }
      const pos = at(0, 0, chairZ);
      diners.push({ x:pos.x, z:pos.z, floorY:pavingY, heading:heading+chairTurn, stride:0, walking:0, browsing:0, time:0 });
    }
  }
  parts.build(group);
  return { diners };
}
