import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Parts, type Unit } from "./geometry";
import { retailBays } from "./retailFrontages";
import { wingBoundaries } from "./wings";

// Sign faces sit just behind the parapet, parallel to the frontage below.
// The café and bakery face their respective terraces on opposite sides of the pavilion.
const boards = [
  { bay: 196, label: "BANK",    width: 2.90, face: "#bdcabc", ink: "#283e36",
    icon: "M3 9L15 3L27 9ZM6 12V22M12 12V22M18 12V22M24 12V22M3 25H27" },
  { bay: 178, label: "LIBRARY", width: 3.36, face: "#b5cbd4", ink: "#263d4a",
    icon: "M15 9Q10 5 3 6V23Q9 22 15 26Q21 22 27 23V6Q20 5 15 9V26" },
  { bay: 150, label: "CAFÉ",    width: 2.64, face: "#e8c6b5", ink: "#633e34",
    icon: "M4 11H21V16Q21 23 14 23H11Q4 23 4 16ZM21 12H24Q29 12 25 17L21 18M3 26H25M10 7Q8 5 11 2M16 7Q14 5 17 2" },
  { bay: 212, label: "SHOPS",   width: 3.02, face: "#d1c8d7", ink: "#45394b",
    icon: "M3 13L6 5H24L27 13M3 13Q6 18 9 13Q12 18 15 13Q18 18 21 13Q24 18 27 13M5 16V26H25V16M10 26V19H16V26" },
  { bay: 131, label: "BAKERY",  width: 3.02, face: "#e4cea2", ink: "#51412e",
    icon: "M3 20Q0 16 8 10Q17 3 24 8Q30 12 24 18Q16 26 7 24ZM11 10L15 14M16 8L20 12" },
] as const;

const tileHeight = 256, atlasHeight = 2048;
function lettering() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext("2d")!;
  boards.forEach((board, row) => {
    ctx.save();
    ctx.translate(0, row * tileHeight);
    ctx.fillStyle = board.face;
    ctx.fillRect(0, 0, canvas.width, tileHeight);
    ctx.fillStyle = ctx.strokeStyle = board.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 15, 988, 226);
    ctx.fillRect(235, 58, 3, 140);
    ctx.font = row === 0 || row === 4 ? "bold 118px Georgia, serif" : "600 112px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(board.label, 614, 139, 664);
    ctx.translate(56, 47);
    ctx.scale(5.3, 5.3);
    ctx.lineWidth = 1.65;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.stroke(new Path2D(board.icon));
    ctx.restore();
  });
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function addRoofSigns(group: T.Group, units: Unit[], deck: number) {
  const bays = wingBoundaries.flatMap(wing => retailBays(wing, units));
  const hardware = new Parts();
  const faces: T.BufferGeometry[] = [];
  const height = 0.86, clearance = 0.61, depth = 0.11;
  boards.forEach((board, row) => {
    const bay = bays.find(candidate => candidate.id === board.bay);
    if (!bay) return;
    const centre = bay.at(0, 1.06);
    const normal = bay.at(0, 0).sub(centre).normalize();
    const tangent = new T.Vector2(normal.y, -normal.x);
    const yaw = Math.atan2(normal.x, normal.y);
    const midY = deck + clearance + height / 2;
    for (const side of [-1, 1]) {
      const foot = centre.clone().addScaledVector(tangent, side * board.width * 0.34);
      hardware.box("#88847a", foot.x, deck + 0.035, foot.y, 0.31, 0.07, 0.43, yaw);
      hardware.box("#6d736e", foot.x, deck + clearance / 2, foot.y, 0.09, clearance, 0.09, yaw);
      const face = new T.PlaneGeometry(board.width - 0.055, height - 0.055);
      const uv = face.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, 0.004 + 0.992 * uv.getX(i),
          1 - (row * tileHeight + 2 + (1 - uv.getY(i)) * (tileHeight - 4)) / atlasHeight);
      }
      face.rotateY(yaw + (side === -1 ? Math.PI : 0));
      const distance = side * (depth / 2 + 0.001);
      face.translate(centre.x + normal.x * distance, midY, centre.y + normal.y * distance);
      faces.push(face);
    }
    hardware.box("#807c70", centre.x, midY, centre.y, board.width, height, depth, yaw);
  });
  hardware.build(group);
  if (!faces.length) return;
  const map = lettering();
  // The boards are backlit after dark.
  const material = new T.MeshStandardMaterial({
    map, emissiveMap: map, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.86,
  });
  const print = new T.Mesh(mergeGeometries(faces)!, material);
  print.userData.night = (on: boolean) => { material.emissiveIntensity = on ? 0.85 : 0; };
  print.name = "Rooftop district signs";
  group.add(print);
  faces.forEach(face => face.dispose());
}
