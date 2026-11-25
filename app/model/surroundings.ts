import * as T from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { boardOutline, entranceLength, entranceOrigin, entrancePoint, entranceYaw } from "./entranceLayout";
import { finished } from "./realism";

/**
 * The countryside around the market: farmland and village houses out to a hazy horizon,
 * a belt of mature trees around the plot and the main road the entrance joins.
 */

const span = 8400; // metres covered by the terrain and its field map
const groundY = -.06;
const roadWidth = 7.5, shoulder = 1.4;
// The main road's inner shoulder starts exactly where the entrance road leaves the board.
const roadOffset = entranceLength + roadWidth / 2 + shoulder;

function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function inside(point: T.Vector2, ring: T.Vector2[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/** Distance outside the display board; negative inside it. */
function boardDistance(point: T.Vector2) {
  let best = Infinity;
  const ab = new T.Vector2(), ap = new T.Vector2();
  for (let i = 0; i < boardOutline.length; i++) {
    const a = boardOutline[i], b = boardOutline[(i + 1) % boardOutline.length];
    ab.subVectors(b, a); ap.subVectors(point, a);
    const t = T.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    best = Math.min(best, ap.addScaledVector(ab, -t).length());
  }
  return inside(point, boardOutline) ? -best : best;
}

const along = new T.Vector2(Math.cos(entranceYaw), -Math.sin(entranceYaw));
const outward = new T.Vector2(Math.sin(entranceYaw), Math.cos(entranceYaw));
/** Signed distance across the main road from its centreline. */
function acrossRoad(point: T.Vector2) {
  return point.clone().sub(entranceOrigin).dot(outward) - roadOffset;
}

// ---------------------------------------------------------------- field map

// November in western Uttar Pradesh: standing sugarcane, fields ploughed for wheat, mustard in flower.
const crops = [
  { colour: "#3d5629", weight: .28, rows: "#2f4521" },  // sugarcane
  { colour: "#86704f", weight: .24, rows: "#735f42" },  // ploughed and sown
  { colour: "#a08f68", weight: .14, rows: "#8d7d59" },  // harvested paddy stubble
  { colour: "#6f8a3c", weight: .12, rows: "#5d752f" },  // wheat seedlings
  { colour: "#b9a43d", weight: .08, rows: "#a59032" },  // mustard
  { colour: "#56703a", weight: .14, rows: "#486130" },  // fodder
];

function fieldMap(villages: T.Vector2[]) {
  const verge = "#5f6c3c";
  const size = 2048, metres = span / size;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  const rand = random(907);
  const toPixel = (x: number, z: number) => [(x / span + .5) * size, (z / span + .5) * size];
  c.fillStyle = "#8a8160"; // earthen bunds and cart tracks
  c.fillRect(0, 0, size, size);
  // Parcels follow two survey grids, as old village land records do.
  for (const angle of [.32, -.21]) {
    c.save();
    c.translate(size / 2, size / 2);
    c.rotate(angle);
    for (let y = -size * .75; y < size * .75;) {
      const depth = (28 + rand() * 70) / metres;
      for (let x = -size * .75; x < size * .75;) {
        const width = (35 + rand() * 120) / metres;
        let pick = rand(), crop = crops[0];
        for (const candidate of crops) { crop = candidate; if ((pick -= candidate.weight) < 0) break; }
        if (rand() < .5 || angle > 0) {
          c.fillStyle = crop.colour;
          c.fillRect(x + .6, y + .6, width - 1.2, depth - 1.2);
          c.strokeStyle = crop.rows;
          c.globalAlpha = .35;
          c.lineWidth = .5;
          c.beginPath();
          for (let r = y + 1.5; r < y + depth - 1; r += 1.6) { c.moveTo(x + 1, r); c.lineTo(x + width - 1, r); }
          c.stroke();
          c.globalAlpha = 1;
        }
        x += width;
      }
      y += depth;
    }
    c.restore();
  }
  // Village lanes, yards and threshing grounds.
  for (const v of villages) {
    const [px, py] = toPixel(v.x, v.y);
    const yard = c.createRadialGradient(px, py, 2, px, py, 230 / metres);
    yard.addColorStop(0, "rgba(150,132,104,.95)");
    yard.addColorStop(1, "rgba(150,132,104,0)");
    c.fillStyle = yard;
    c.fillRect(px - 240 / metres, py - 240 / metres, 480 / metres, 480 / metres);
  }
  // A mown verge about 35 m wide around the plot, softened into the neighbouring fields.
  c.save();
  c.filter = "blur(3px)";
  c.strokeStyle = c.fillStyle = verge;
  c.lineJoin = "round";
  c.lineWidth = 70 / metres;
  c.beginPath();
  boardOutline.forEach((p, i) => { const [x, y] = toPixel(p.x, p.y); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  // Worn earth where carts and footpaths cross the verge.
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, r = 95 + rand() * 30;
    const [x, y] = toPixel(Math.cos(a) * r * 1.1, Math.sin(a) * r * .8);
    c.fillStyle = "rgba(140,122,92,.35)";
    c.beginPath(); c.ellipse(x, y, 1 + rand() * 3, 1 + rand() * 2, rand() * 3, 0, Math.PI * 2); c.fill();
  }
  // Large-scale mottling so no two fields read as flat paint.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size, y = rand() * size, r = 4 + rand() * 22;
    c.fillStyle = rand() < .5 ? "rgba(40,48,25,.07)" : "rgba(190,180,140,.06)";
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ---------------------------------------------------------------- trees and houses

const broadleaf = { trunkHeight: 3, crownWidth: 4.1, crownHeight: 3.4, crownCentre: 3 + 3.4 * .62 };
const eucalyptus = { trunkHeight: 7, crownWidth: 2.1, crownHeight: 5.5, crownCentre: 7 + 5.5 * .55 };

/**
 * A clump of foliage on a transparent card: a solid, irregular leafy mass whose rim breaks into single
 * leaves. Keeping the interior opaque at every mipmap level stops distant canopies dissolving into a
 * dithered, see-through haze; only the ragged outline needs alpha-to-coverage.
 */
function leafTexture() {
  const size = 512, canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  const rand = random(613);
  const centre = size / 2;
  // The clump: a lobed outline filled with the shaded green of leaves seen in depth.
  const lobes = Array.from({ length: 9 }, () => [rand() * Math.PI * 2, .08 + .1 * rand()]);
  const reach = (a: number) => 168 * (1 + lobes.reduce((sum, [phase, depth]) => sum + depth * Math.sin(3 * a + phase) / 3, 0));
  c.fillStyle = "#2e4520";
  c.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = i / 96 * Math.PI * 2, r = reach(a);
    if (i) c.lineTo(centre + Math.cos(a) * r, centre + Math.sin(a) * r);
    else c.moveTo(centre + Math.cos(a) * r, centre + Math.sin(a) * r);
  }
  c.fill();
  const tones = ["#253a19", "#30481f", "#3d5827", "#4c6a2e", "#5f7f37", "#77944a"];
  for (let i = 0; i < 1500; i++) {
    const a = rand() * Math.PI * 2, edge = reach(a);
    // Most leaves sit on the clump; a few stand proud of the rim to break the outline.
    const r = edge * (rand() < .78 ? Math.sqrt(rand()) : 1 + .22 * rand());
    const x = centre + Math.cos(a) * r, y = centre + Math.sin(a) * r;
    const length = 18 + rand() * 20, width = length * (.34 + .1 * rand());
    // Leaves toward the top of the clump face the sky and read lighter.
    const lit = T.MathUtils.clamp((centre - y) / 340 + .5 + (rand() - .5) * .7, 0, .999);
    c.save();
    c.translate(x, y); c.rotate(rand() * Math.PI);
    c.fillStyle = tones[Math.floor(lit * tones.length)];
    c.beginPath(); c.ellipse(0, 0, length / 2, width / 2, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(170,190,120,.28)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-length / 2, 0); c.lineTo(length / 2, 0); c.stroke();
    c.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Leaf-cluster cards scattered through a broadleaf crown. Normals point out of the crown rather
 * than out of each card, so the canopy shades as one volume while its edge stays ragged.
 */
function leafCards(count: number, seed: number) {
  const rand = random(seed);
  const { crownWidth, crownHeight, crownCentre } = broadleaf;
  const position: number[] = [], normal: number[] = [], uv: number[] = [], colour: number[] = [];
  const centre = new T.Vector3(0, crownCentre, 0), corner = new T.Vector3(), radial = new T.Vector3();
  const turn = new T.Quaternion(), euler = new T.Euler(), across = new T.Vector3(), up = new T.Vector3(), face = new T.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, b = Math.acos(rand() * 1.6 - .7), shell = .55 + .45 * Math.sqrt(rand());
    const at = new T.Vector3(Math.sin(b) * Math.cos(a) * crownWidth * 1.05, Math.cos(b) * crownHeight * .95, Math.sin(b) * Math.sin(a) * crownWidth * 1.05)
      .multiplyScalar(shell).add(centre);
    const size = 1.7 + rand() * 1.2;
    turn.setFromEuler(euler.set((rand() - .5) * 1.2, rand() * Math.PI * 2, (rand() - .5) * 1.2));
    across.set(1, 0, 0).applyQuaternion(turn).multiplyScalar(size / 2);
    up.set(0, 1, 0).applyQuaternion(turn).multiplyScalar(size / 2);
    face.set(0, 0, 1).applyQuaternion(turn);
    const flip = rand() < .5, u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
    const corners: [number, number, number, number][] = [[-1, -1, u0, 0], [1, -1, u1, 0], [1, 1, u1, 1], [-1, -1, u0, 0], [1, 1, u1, 1], [-1, 1, u0, 1]];
    for (const [x, y, u, v] of corners) {
      corner.copy(at).addScaledVector(across, x).addScaledVector(up, y);
      position.push(corner.x, corner.y, corner.z);
      radial.subVectors(corner, centre).normalize().multiplyScalar(.8).addScaledVector(face, face.dot(radial) < 0 ? -.2 : .2);
      // Undersides face mostly sideways: they stay dim instead of catching light from below.
      radial.y = radial.y * .6 + .3;
      radial.normalize();
      normal.push(radial.x, radial.y, radial.z);
      uv.push(u, v);
      // Inner and lower leaves sit in their neighbours' shade.
      const light = .55 + .45 * T.MathUtils.clamp((corner.y - crownCentre + crownHeight) / (crownHeight * 2), 0, 1) * shell;
      colour.push(light, light, light);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colour, 3));
  return geometry;
}

/**
 * A broadleaf canopy (mango, neem, shisham) or a tall eucalyptus: lumpy lobes clustered on an
 * ellipsoid crown over a short trunk, darker underneath where the leaves shade each other.
 */
function treeGeometry(lobes: number, seed: number, tall = false, fill = 1) {
  const rand = random(seed);
  const bark = new T.Color("#4f4136"), leaf = new T.Color(tall ? "#76845a" : "#4c6430");
  const pieces: T.BufferGeometry[] = [];
  const colour = (geometry: T.BufferGeometry, tint: (x: number, y: number, z: number) => T.Color) => {
    const position = geometry.getAttribute("position");
    const colours = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) tint(position.getX(i), position.getY(i), position.getZ(i)).toArray(colours, i * 3);
    geometry.setAttribute("color", new T.BufferAttribute(colours, 3));
    return geometry;
  };
  const { trunkHeight, crownWidth, crownHeight, crownCentre } = tall ? eucalyptus : broadleaf;
  pieces.push(colour(new T.CylinderGeometry(tall ? .14 : .2, tall ? .24 : .34, trunkHeight + 1, 7, 1, true)
    .translate(0, (trunkHeight + 1) / 2, 0).toNonIndexed(), () => bark));
  const shade = new T.Color();
  for (let i = 0; i < lobes; i++) {
    // The first lobe fills the core; the rest sit on the crown's surface, mostly on top and around it.
    const a = rand() * Math.PI * 2, rise = i === 0 ? 0 : rand() * 1.4 - .45;
    const reach = i === 0 ? 0 : .58 * fill;
    const radius = (i === 0 ? .78 : .42 + .2 * rand()) * crownWidth * fill;
    let lobe: T.BufferGeometry = new T.IcosahedronGeometry(1, 1);
    lobe.deleteAttribute("uv"); lobe.deleteAttribute("normal");
    lobe = mergeVertices(lobe);
    const p = lobe.getAttribute("position");
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      // Clumped foliage: a deterministic lumpy surface, flattened underneath.
      const bump = 1 + .2 * Math.sin(x * 4.1 + z * 3.3 + seed + i) * Math.cos(y * 3.7 - x * 2.3) + .1 * Math.sin(z * 7.9 + y * 6.1 + i);
      p.setXYZ(v, x * radius * bump, (y < 0 ? y * .55 : y) * radius * bump * (crownHeight / crownWidth), z * radius * bump);
    }
    lobe.translate(Math.cos(a) * crownWidth * reach * Math.cos(rise * .8), crownCentre + rise * crownHeight * .45,
      Math.sin(a) * crownWidth * reach * Math.cos(rise * .8));
    lobe = lobe.toNonIndexed();
    // Shade by height in the crown; the speckle depends on position alone so shared vertices still merge.
    pieces.push(colour(lobe, (x, height, z) => {
      const light = T.MathUtils.clamp((height - trunkHeight) / (crownHeight * 1.6), 0, 1);
      return shade.copy(leaf).multiplyScalar((.5 + .55 * light + .07 * Math.sin(x * 12.99 + height * 78.23 + z * 37.72)) * (fill < 1 ? .7 : 1));
    }));
  }
  for (const piece of pieces) { piece.deleteAttribute("uv"); piece.deleteAttribute("normal"); }
  const merged = mergeVertices(mergeGeometries(pieces)!, 1e-4);
  merged.computeVertexNormals();
  pieces.forEach(piece => piece.dispose());
  return merged;
}

type Planting = { x: number; z: number; scale: number; yaw: number; tint: T.Color };

/**
 * Wind on instanced trees: the crown sways more the higher it is, each tree on its own phase,
 * and leaf cards add a quick flutter. Shadows and occlusion keep the resting pose.
 */
function inWind<M extends T.Material>(material: M, wind: T.IUniform<number>, flutter: number): M {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.treeWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float treeWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec2 rootAt = instanceMatrix[3].xz;
          #else
            vec2 rootAt = vec2(0.0);
          #endif
          float phase = dot(rootAt, vec2(.071, .053));
          float gust = .55 + .45 * sin(treeWind * .31 + phase * .4);
          float bend = pow(max(position.y - 2.0, 0.0) / 9.0, 1.6) * gust;
          transformed.x += bend * (.16 * sin(treeWind * 1.1 + phase) + .05 * sin(treeWind * 2.3 + phase * 1.7));
          transformed.z += bend * .1 * sin(treeWind * .9 + phase * 1.3);
          float leaf = dot(position, vec3(3.1, 1.7, 2.3));
          transformed += normal * ${flutter.toFixed(3)} * gust * sin(treeWind * 5.3 + leaf);
        }`);
  };
  material.customProgramCacheKey = () => previousKey + "|wind" + flutter;
  return material;
}

function plantTrees(villages: T.Vector2[]) {
  const rand = random(4111);
  const belt: Planting[] = [], fields: Planting[] = [];
  // Per-tree tints around white keep the bark brown while the foliage varies in hue and vigour.
  const greens = ["#e8f0d8", "#ffffff", "#d0dcc0", "#f4f0cf", "#c4cfb4", "#fff6dc"].map(c => new T.Color(c));
  const point = new T.Vector2();
  function clear(x: number, z: number, margin: number) {
    point.set(x, z);
    if (Math.abs(acrossRoad(point)) < roadWidth / 2 + 3.5) return false;
    // Keep the approach to the gate open where the entrance road meets the main road.
    const gate = point.clone().sub(entrancePoint(0, entranceLength));
    if (Math.abs(gate.dot(along)) < 16 && gate.dot(outward) > -2 && gate.dot(outward) < roadOffset + 10) return false;
    if (villages.some(v => v.distanceTo(point) < 115)) return false;
    return boardDistance(point) > margin;
  }
  function add(list: Planting[], x: number, z: number, scale: number) {
    const tint = greens[Math.floor(rand() * greens.length)].clone().multiplyScalar(.85 + .3 * rand());
    list.push({ x, z, scale, yaw: rand() * Math.PI * 2, tint });
  }
  // A dense belt of mango and neem hugging the plot, thinning with distance from its boundary.
  for (let i = 0; i < 30000 && belt.length < 560; i++) {
    const x = (rand() - .5) * 460, z = (rand() - .5) * 400;
    point.set(x, z);
    const distance = boardDistance(point);
    const density = distance < 10 ? 0 : distance < 60 ? .9 : Math.exp(-(distance - 60) / 45) * .9;
    if (rand() < density && clear(x, z, 10) && !belt.some(t => Math.hypot(t.x - x, t.z - z) < 8)) add(belt, x, z, 1 + .55 * rand());
  }
  // Eucalyptus lines along field boundaries and scattered shade trees across the farmland.
  for (let row = 0; row < 60; row++) {
    const a = rand() * Math.PI * 2, r = 300 + rand() * 2600, heading = rand() < .5 ? .32 : -.21;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    const count = 6 + Math.floor(rand() * 18);
    for (let k = 0; k < count; k++) {
      x += Math.cos(heading) * (7 + rand() * 3); z += Math.sin(heading) * (7 + rand() * 3);
      if (clear(x, z, 40)) add(fields, x, z, .8 + .4 * rand());
    }
  }
  for (let i = 0; i < 2600 && fields.length < 1700; i++) {
    const a = rand() * Math.PI * 2, r = 280 + Math.pow(rand(), .8) * 3300;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z, 40)) {
      // Orchards and village groves grow in clumps.
      const clump = rand() < .35 ? 3 + Math.floor(rand() * 6) : 1;
      for (let k = 0; k < clump; k++) add(fields, x + (rand() - .5) * 26, z + (rand() - .5) * 26, .75 + .5 * rand());
    }
  }
  return { belt, fields };
}

function instancedPlantings(name: string, geometry: T.BufferGeometry, material: T.Material, plantings: Planting[], shadows: boolean) {
  const mesh = new T.InstancedMesh(geometry, material, plantings.length);
  mesh.name = name;
  const matrix = new T.Matrix4(), rotation = new T.Quaternion(), scale = new T.Vector3(), position = new T.Vector3();
  plantings.forEach(({ x, z, scale: s, yaw, tint }, i) => {
    rotation.setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    matrix.compose(position.set(x, groundY, z), rotation, scale.set(s, s * (.9 + .2 * Math.sin(i)), s));
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, tint);
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function addVillages(group: T.Group, villages: T.Vector2[]) {
  const rand = random(733);
  const walls = ["#d9d2c4", "#c9b9a2", "#b98f74", "#e2dccf", "#a98a6f", "#cfc3ae"].map(c => new T.Color(c));
  const homes: { x: number; z: number; w: number; d: number; h: number; yaw: number; tint: T.Color }[] = [];
  for (const v of villages) {
    const yaw = rand() * .6 - .3;
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(rand()) * 105, a = rand() * Math.PI * 2;
      const x = v.x + Math.cos(a) * r, z = v.y + Math.sin(a) * r;
      const w = 6 + rand() * 7, d = 8 + rand() * 9;
      if (homes.some(h => Math.hypot(h.x - x, h.z - z) < (h.w + w) * .55)) continue;
      homes.push({ x, z, w, d, h: rand() < .35 ? 6.4 : 3.3, yaw: yaw + (rand() < .2 ? Math.PI / 2 : 0), tint: walls[Math.floor(rand() * walls.length)] });
    }
  }
  const box = new T.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const houses = new T.InstancedMesh(box, finished("plaster", { roughness: .9 }, { macro: .15 }), homes.length);
  const tanks = new T.InstancedMesh(new T.CylinderGeometry(.55, .55, 1.1, 10).translate(0, .55, 0),
    new T.MeshStandardMaterial({ color: "#2b3236", roughness: .55 }), homes.length);
  const matrix = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  homes.forEach((home, i) => {
    q.setFromAxisAngle(up, home.yaw);
    houses.setMatrixAt(i, matrix.compose(p.set(home.x, groundY, home.z), q, s.set(home.w, home.h, home.d)));
    houses.setColorAt(i, home.tint);
    tanks.setMatrixAt(i, matrix.compose(p.set(home.x + home.w * .25, groundY + home.h, home.z - home.d * .2), q, s.set(1, 1, 1)));
  });
  houses.name = "Village houses";
  tanks.name = "Village roof tanks";
  houses.receiveShadow = tanks.receiveShadow = true;
  for (const mesh of [houses, tanks]) mesh.computeBoundingSphere();
  group.add(houses, tanks);
}

// ---------------------------------------------------------------- road

function addMainRoad(group: T.Group) {
  const length = 1600, top = .032;
  const centre = entrancePoint(0, roadOffset);
  const road = new T.Group();
  road.name = "Main road";
  road.position.set(centre.x, 0, centre.y);
  road.rotation.y = entranceYaw;
  // Slab from the outer verge to the threshold of the entrance road, flush with its asphalt.
  const deck = new T.Mesh(new T.BoxGeometry(length, top - groundY, roadWidth + 2 * shoulder).translate(0, (top + groundY) / 2, 0),
    finished("asphalt", { color: "#4a4a4c", roughness: .9 }, { macro: .12 }));
  deck.receiveShadow = true;
  const verge = new T.Mesh(new T.BoxGeometry(length, .02, 2.4).translate(0, groundY + .01, roadWidth / 2 + shoulder + 1.2),
    finished("stone", { color: "#9a8f7b", roughness: 1 }, { albedo: .5, macro: .2 }));
  verge.receiveShadow = true;
  const paint = new T.MeshStandardMaterial({ color: "#e9e6dc", roughness: .7 });
  const lines: T.BufferGeometry[] = [];
  for (const edge of [-1, 1]) lines.push(new T.BoxGeometry(length, .004, .12).translate(0, top + .002, edge * (roadWidth / 2 - .2)));
  for (let x = -length / 2; x < length / 2; x += 9) lines.push(new T.BoxGeometry(3, .004, .12).translate(x, top + .002, 0));
  const markings = new T.Mesh(mergeGeometries(lines)!, paint);
  lines.forEach(line => line.dispose());
  road.add(deck, verge, markings);
  group.add(road);
}

export function addSurroundings(scene: T.Scene, quality: { trees: number }) {
  const wind = { value: 0 };
  const group = new T.Group();
  group.name = "Surrounding countryside";
  const villages = [new T.Vector2(-620, -540), new T.Vector2(760, -380), new T.Vector2(-380, 820), new T.Vector2(1450, 900)];

  const ground = new T.Shape();
  ground.absarc(0, 0, span / 2, 0, Math.PI * 2, false);
  ground.holes.push(new T.Path(boardOutline.map(p => new T.Vector2(p.x, -p.y))));
  const terrain = new T.ShapeGeometry(ground, 96);
  terrain.rotateX(-Math.PI / 2);
  terrain.translate(0, groundY, 0);
  const position = terrain.getAttribute("position"), uv = terrain.getAttribute("uv");
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / span + .5, .5 - position.getZ(i) / span);
  const land = new T.Mesh(terrain, finished("grass", { map: fieldMap(villages), roughness: 1 }, { albedo: .8, normal: .8, macro: .1 }));
  land.name = "Farmland";
  land.receiveShadow = true;
  group.add(land);

  const { belt, fields } = plantTrees(villages);
  // Leaf clusters with shadowed gaps break each canopy into sunlit and shaded masses.
  const foliage = inWind(finished("foliage", { vertexColors: true, roughness: .75 }, { normal: 1.5, macro: .16 }), wind, 0);
  // Near trees: a dark inner crown filled out by alpha-tested leaf clusters that cast dappled shade.
  group.add(instancedPlantings("Tree belt crowns", treeGeometry(5, 11, false, .72), foliage, belt, true));
  const leafMaterial = inWind(new T.MeshStandardMaterial({
    map: leafTexture(), alphaTest: .5, alphaToCoverage: true, side: T.DoubleSide, vertexColors: true, roughness: .85,
  }), wind, .035);
  const leaves = instancedPlantings("Tree belt leaves", leafCards(130, 13), leafMaterial, belt, true);
  // Leaf cards would occlude as solid squares in the ambient-occlusion depth pass.
  leaves.userData.noAO = true;
  group.add(leaves);
  const keep = Math.round(fields.length * quality.trees);
  const tall = fields.filter((_, i) => i % 4 === 0 && i < keep), round = fields.filter((_, i) => i % 4 !== 0 && i < keep);
  group.add(instancedPlantings("Eucalyptus", treeGeometry(4, 29, true), foliage, tall, false));
  group.add(instancedPlantings("Farm tree crowns", treeGeometry(3, 17, false, .72), foliage, round, false));
  const farmLeaves = instancedPlantings("Farm tree leaves", leafCards(70, 19), leafMaterial, round, false);
  farmLeaves.userData.noAO = true;
  group.add(farmLeaves);
  addVillages(group, villages);
  addMainRoad(group);
  scene.add(group);
  return { group, setTime(seconds: number) { wind.value = seconds; } };
}
