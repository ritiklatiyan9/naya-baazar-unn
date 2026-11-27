import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const tau = Math.PI * 2, ss = T.MathUtils.smoothstep, lerp = T.MathUtils.lerp;
const down = (x: number, a: number, b: number) => 1 - ss(x, a, b);
export type V3 = [number, number, number];

/** Vertex rings follow the jaw, cheekbones and skull at real head scale. */
const skull = [
  [-.008,.007,.039,.055],[0,.042,.078,.062],[.020,.064,.094,.077],[.053,.078,.098,.094],
  [.087,.088,.096,.105],[.118,.097,.099,.108],[.15,.099,.095,.107],[.183,.098,.099,.103],
  [.212,.089,.097,.096],[.232,.069,.076,.081],[.249,.039,.044,.049],[.257,.003,.003,.004],
];
function skullPoint(theta:number, y:number) {
  let i=1;
  while(i<skull.length-1 && skull[i][0]<y)i++;
  const a=skull[i-1], b=skull[i];
  const f=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  const front=Math.cos(theta);
  const width=T.MathUtils.lerp(a[1],b[1],f);
  const x=Math.sin(theta)*width;
  const depth=T.MathUtils.lerp(front>=0?a[2]:a[3],front>=0?b[2]:b[3],f);
  let z=front*depth;
  if(front>0){
    const bump=(cx:number,cy:number,wx:number,wy:number)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
    // These volumes carry the silhouette when seen in profile; the portrait follows this same surface.
    z+=front*(.020*bump(0,.125,.014,.047)+.029*bump(0,.092,.021,.014)
      +.007*bump(0,.057,.033,.012)+.004*bump(0,.024,.037,.013)
      +.006*bump(.045,.115,.027,.020)+.006*bump(-.045,.115,.027,.020)
      -.005*bump(.038,.145,.023,.012)-.005*bump(-.038,.145,.023,.012));
  }
  return new T.Vector3(x,y,z);
}

type Sample = { p:T.Vector3; u:number; v:number; alpha?:number };
function surface(rows:number,columns:number, point:(u:number,v:number)=>Sample) {
  const positions:number[]=[], uv:number[]=[], colors:number[]=[], indices:number[]=[];
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
    const sample=point(column/columns,row/rows);
    positions.push(...sample.p.toArray());
    uv.push(sample.u,sample.v);
    if(sample.alpha!==undefined)colors.push(1,1,1,sample.alpha);
    if(row<rows && column<columns){
      const i=row*(columns+1)+column;
      indices.push(i,i+1,i+columns+2,i,i+columns+2,i+columns+1);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute("position",new T.Float32BufferAttribute(positions,3));
  geo.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  if(colors.length)geo.setAttribute("color",new T.Float32BufferAttribute(colors,4));
  geo.setIndex(indices);geo.computeVertexNormals();
  return geo;
}

export function headGeometry() {
  return surface(16,24,(u,v)=>({p:skullPoint((u-.5)*tau,-.008+.265*v),u,v}));
}
/** The face decal over the skull. `sides` is where it has faded out at the cheeks: .5 shows temples and ears (hair covers them),
 * .34 only the face, for a head whose sides show inside a helmet. */
export function portraitGeometry(sides = .5) {
  return surface(21,24,(u,v)=>{
    const a=(u-.5)*2.84, y=.001+v*.221;
    const p=skullPoint(a,y);
    p.x+=Math.sin(a)*.0014;p.z+=Math.cos(a)*.0015;
    const alpha=T.MathUtils.smoothstep(v,0,.095)*(1-T.MathUtils.smoothstep(v,.90,1))
      *(1-T.MathUtils.smoothstep(Math.abs(u-.5),sides*.72,sides));
    const faceY=y<.145? .94-(y/.145)*.48 : .46-(y-.145)/.077*.327;
    return {p,u:.50+p.x*4.04,v:1-faceY,alpha};
  });
}

let portraits: { material: T.MeshStandardMaterial; ready: Promise<void> } | undefined;
/** The face atlas, loaded once and shared by every figure: pedestrians and vehicle occupants show their faces together. */
export function shopperPortraits(){
  if(portraits)return portraits;
  const material=new T.MeshStandardMaterial({
    vertexColors:true, transparent:true, roughness:.9, depthWrite:false,
    polygonOffset:true, polygonOffsetFactor:-1,
  });
  material.visible=false;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nattribute float portraitCell;")
      .replace("#include <uv_vertex>","#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv=(vMapUv+vec2(mod(portraitCell,4.0),1.0-floor(portraitCell/4.0)))/vec2(4.0,2.0);\n#endif");
  };
  // Browsers decode the atlas once. A paused scene repaints as soon as the faces are available.
  const ready=typeof Image==="undefined"?Promise.resolve():new Promise<void>(resolve=>{
    const map=new T.TextureLoader().load("/media/shopper-faces.webp",()=>{
      material.visible=true;material.needsUpdate=true;resolve();
    },undefined,()=>resolve());
    map.colorSpace=T.SRGBColorSpace; map.anisotropy=4; material.map=map;
  });
  return portraits={material,ready};
}

/** The head with ears, for the instanced figures. Each ear is a cupped shell set back on the skull. */
export function shopperHeadGeometry() {
  const ear = new T.SphereGeometry(.5, 8, 6), p = ear.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    // The bowl of the concha: the outer face dishes in towards the middle of the ear.
    const x = p.getX(i), rim = Math.hypot(p.getY(i), p.getZ(i)) * 2;
    if (x > 0) p.setX(i, x - .32 * (1 - rim * rim));
  }
  ear.scale(.019, .052, .029).rotateX(-.24).rotateY(-.1).translate(.091, .104, -.014);
  const other = ear.clone().scale(-1, 1, 1);
  other.index!.array.reverse();
  for (const g of [ear, other]) g.computeVertexNormals();
  return mergeGeometries([headGeometry(), ear, other]);
}

// ---------------------------------------------------------------- builds and bones

/** Each instance carries four colours (upper garment, lower garment, accent, skin); a vertex picks one and the surface that goes with it. */
export const Slot = { upper: 0, lower: 1, accent: 2, skin: 3, leather: 4, sole: 5, reflective: 6, dark: 7, strap: 8 } as const;

export type Build = {
  female: boolean; pelvis: number; chest: number; neck: number; head: number; hip: number; thigh: number; shin: number;
  shoulder: V3; upper: number; forearm: number; arm: number; leg: number; hand: number;
  /** Torso cross-sections: height, half width, front depth, back depth, squareness. */
  torso: number[][]; bust: number; bustY: number;
};
/** Joint heights at scale 1 for a 1.70 m man and a 1.58 m woman, with their torsos. */
export const builds: Record<"man" | "woman", Build> = {
  man: {
    female: false, pelvis: .905, chest: .135, neck: .435, head: .885, hip: .085, thigh: .42, shin: .41,
    shoulder: [.166, .325, -.012], upper: .295, forearm: .245, arm: 1, leg: 1, hand: 1,
    torso: [[.785,.1,.058,.066,2],[.80,.143,.083,.098,2.1],[.83,.159,.093,.113,2.2],[.87,.165,.098,.119,2.3],[.91,.164,.099,.117,2.3],
      [.96,.157,.101,.106,2.3],[1.01,.149,.103,.096,2.3],[1.06,.148,.104,.094,2.3],[1.12,.152,.107,.096,2.4],[1.18,.157,.111,.099,2.5],
      [1.24,.159,.112,.101,2.5],[1.29,.163,.107,.101,2.6],[1.33,.174,.099,.097,2.8],[1.358,.182,.088,.091,2.9],[1.38,.172,.076,.081,2.6],
      [1.405,.135,.064,.068,2.2],[1.425,.092,.056,.057,2.1],[1.44,.062,.052,.052,2]],
    bust: .008, bustY: 1.215,
  },
  woman: {
    female: true, pelvis: .84, chest: .125, neck: .405, head: .82, hip: .088, thigh: .39, shin: .38,
    shoulder: [.145, .30, -.01], upper: .27, forearm: .225, arm: .86, leg: .95, hand: .9,
    torso: [[.725,.1,.058,.068,2],[.74,.145,.082,.1,2.1],[.77,.161,.09,.117,2.2],[.81,.17,.094,.127,2.2],[.85,.171,.093,.124,2.2],
      [.90,.159,.091,.111,2.2],[.945,.139,.087,.093,2.2],[.985,.128,.085,.084,2.2],[1.03,.129,.086,.083,2.2],[1.08,.135,.09,.086,2.3],
      [1.13,.14,.094,.09,2.3],[1.18,.142,.093,.092,2.3],[1.215,.146,.088,.09,2.5],[1.245,.156,.079,.084,2.7],[1.268,.158,.07,.076,2.6],
      [1.29,.128,.06,.064,2.2],[1.315,.088,.053,.054,2.1],[1.335,.057,.048,.047,2]],
    bust: .032, bustY: 1.135,
  },
};

/** Bone order of every figure: pelvis, chest, head, then hip, knee, ankle per leg and shoulder, elbow per arm (right side first). */
export const Bone = { pelvis: 0, chest: 1, head: 2, hip: (i: number) => 3 + 3 * i, knee: (i: number) => 4 + 3 * i,
  foot: (i: number) => 5 + 3 * i, shoulder: (i: number) => 9 + 2 * i, elbow: (i: number) => 10 + 2 * i, count: 13 } as const;

const joints = new Map<Build, T.Vector3[]>();
/** Joint positions of the bind (rest) pose, root on the floor at the origin, facing +z. */
export function bindJoints(b: Build) {
  let j = joints.get(b);
  if (!j) {
    const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
    const pelvis = v(0, b.pelvis, 0), chest = v(0, b.pelvis + b.chest, -.005);
    j = [pelvis, chest, v(0, chest.y + b.neck, .01)];
    for (const s of [-1, 1]) j.push(v(s * b.hip, b.pelvis - .01, 0), v(s * b.hip, b.pelvis - .01 - b.thigh, 0), v(s * b.hip, b.pelvis - .01 - b.thigh - b.shin, 0));
    for (const s of [-1, 1]) {
      const shoulder = v(s * b.shoulder[0], chest.y + b.shoulder[1], chest.z + b.shoulder[2]);
      j.push(shoulder, v(shoulder.x, shoulder.y - b.upper, shoulder.z));
    }
    joints.set(b, j);
  }
  return j;
}

// ---------------------------------------------------------------- skinned surfaces

/** Bone influences as [bone, weight, bone, weight, …]. */
type Weights = number[];
/**
 * A vertex, with a point inside the body behind it that orients the faces outward. Loose cloth below the hips
 * carries `d`: the hip height and thigh length of its build and how closely it follows the legs, negative for ends
 * that hang free and are only ever pushed away by a leg (see shoppers.ts).
 */
type Vert = { p: V3; u: number; v: number; w: Weights; slot: number; c: V3; d?: number[] };

function influence(w: Weights, bones: Uint8Array, weights: Float32Array, k: number) {
  const pairs: number[][] = [];
  for (let i = 0; i < w.length; i += 2) {
    if (!(w[i + 1] > 1e-3)) continue;
    const same = pairs.find(p => p[0] === w[i]);
    if (same) same[1] += w[i + 1]; else pairs.push([w[i], w[i + 1]]);
  }
  const kept = pairs.sort((a, b) => b[1] - a[1]).slice(0, 4), total = kept.reduce((s, p) => s + p[1], 0);
  kept.forEach(([bone, x], i) => { bones[k * 4 + i] = bone; weights[k * 4 + i] = x / total; });
}

/** A grid of quads with skin weights and colour slots. Faces turn to point away from each vertex's inner point. */
function sheet(rows: number, cols: number, at: (i: number, j: number) => Vert, skip?: (i: number, j: number) => boolean) {
  const W = cols + 1, n = (rows + 1) * W;
  const position = new Float32Array(n * 3), uv = new Float32Array(n * 2), slot = new Float32Array(n), inner = new Float32Array(n * 3);
  const drape = new Float32Array(n * 3);
  const skinIndex = new Uint8Array(n * 4), skinWeight = new Float32Array(n * 4), index: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const k = i * W + j, v = at(i, j);
    position.set(v.p, k * 3); inner.set(v.c, k * 3);
    if (v.d) drape.set(v.d, k * 3);
    uv[k * 2] = v.u; uv[k * 2 + 1] = v.v; slot[k] = v.slot;
    influence(v.w, skinIndex, skinWeight, k);
    if (i < rows && j < cols && !skip?.(i, j)) index.push(k, k + 1, k + W, k + 1, k + W + 1, k + W);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(position, 3));
  g.setAttribute("uv", new T.BufferAttribute(uv, 2));
  g.setAttribute("skinIndex", new T.BufferAttribute(skinIndex, 4));
  g.setAttribute("skinWeight", new T.BufferAttribute(skinWeight, 4));
  g.setAttribute("slot", new T.BufferAttribute(slot, 1));
  g.setAttribute("drape", new T.BufferAttribute(drape, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const normal = g.getAttribute("normal");
  let outward = 0;
  for (let k = 0; k < n; k++) for (let a = 0; a < 3; a++) outward += normal.getComponent(k, a) * (position[k * 3 + a] - inner[k * 3 + a]);
  if (outward < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

/** Averages normals across coincident vertices: tube seams, poles and garment borders shade as one surface. */
function weld(g: T.BufferGeometry) {
  const p = g.getAttribute("position"), n = g.getAttribute("normal"), sums = new Map<string, number[]>();
  const key = (i: number) => `${Math.round(p.getX(i) * 5e3)},${Math.round(p.getY(i) * 5e3)},${Math.round(p.getZ(i) * 5e3)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), s = sums.get(k) ?? [0, 0, 0];
    s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i);
    sums.set(k, s);
  }
  for (let i = 0; i < p.count; i++) {
    const s = sums.get(key(i))!, l = Math.hypot(s[0], s[1], s[2]) || 1;
    n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l);
  }
  return g;
}

/** Catmull-Rom through table rows sorted on their first column. */
function interpolate(rows: number[][], x: number) {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < x) i++;
  const a = rows[Math.max(i - 1, 0)], b = rows[i], c = rows[i + 1], d = rows[Math.min(i + 2, rows.length - 1)];
  const t = T.MathUtils.clamp((x - b[0]) / (c[0] - b[0]), 0, 1);
  return b.map((_, k) => .5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t
    + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t * t * t));
}

/** A superellipse: squareness 2 is an ellipse, larger values square the shoulders and hips. */
function ellipse(theta: number, rx: number, rz: number, n = 2): [number, number] {
  const s = Math.sin(theta), c = Math.cos(theta), e = 2 / n;
  return [Math.sign(s) * Math.abs(s) ** e * rx, Math.sign(c) * Math.abs(c) ** e * rz];
}

/** A point on the torso at angle theta from the front (towards +x), eased outwards for each layer of clothing. */
function torsoAt(b: Build, theta: number, y: number, ease = 0): V3 {
  const [, w, f, k, n] = interpolate(b.torso, y), c = Math.cos(theta);
  const [x, z] = ellipse(theta, w + ease, (c > 0 ? f : k) + ease, n);
  const bust = c > 0 ? b.bust * c * Math.exp(-(((Math.abs(x) - .057) / .046) ** 2) - ((y - b.bustY) / .052) ** 2) : 0;
  return [x, y, z + bust];
}

// Weights: the waist bends between pelvis and chest, the neck between chest and head, and the
// shoulder line follows a raised arm. Limbs bend over a few centimetres around each joint.
const hang = (b: Build, follow = 1) => [bindJoints(b)[3].y, b.thigh, follow];
function trunkWeights(b: Build, [x, y]: V3 | number[]): Weights {
  const j = bindJoints(b), sh = j[9], side = x < 0 ? 0 : 1;
  const c = ss(y, j[1].y - .09, j[1].y + .07), h = ss(y, j[2].y - .055, j[2].y + .01);
  const s = .55 * ss(Math.abs(x), Math.abs(sh.x) - .085, Math.abs(sh.x) - .01) * ss(y, sh.y - .12, sh.y - .02);
  return [Bone.pelvis, 1 - c, Bone.chest, c * (1 - h) * (1 - s), Bone.head, c * h, Bone.shoulder(side), c * (1 - h) * s];
}
const armWeights = (b: Build, i: number) => (y: number): Weights => {
  const j = bindJoints(b), sh = j[Bone.shoulder(i)], el = j[Bone.elbow(i)];
  const a = down(y, sh.y - .09, sh.y + .045), e = down(y, el.y - .05, el.y + .05);
  return [Bone.chest, 1 - a, Bone.shoulder(i), a * (1 - e), Bone.elbow(i), a * e];
};
const legWeights = (b: Build, i: number) => (y: number): Weights => {
  const j = bindJoints(b), hip = j[Bone.hip(i)], knee = j[Bone.knee(i)];
  const a = down(y, hip.y - .12, hip.y + .05), k = down(y, knee.y - .06, knee.y + .06);
  return [Bone.pelvis, 1 - a, Bone.hip(i), a * (1 - k), Bone.knee(i), a * k];
};

/** A band of the torso between two heights, eased out by a layer of clothing. Below `hang` it falls straight. */
function trunk(b: Build, y0: number, y1: number, ease: number, slot: number,
  o: { close?: boolean; skip?: (p: V3) => boolean; cols?: number; hang?: number } = {}) {
  const cols = o.cols ?? 28, rows = Math.max(2, Math.round((y1 - y0) / .027)), fall = o.hang ?? 0, swing = hang(b);
  const at = (i: number, j: number): Vert => {
    const theta = (j / cols - .5) * tau, y = lerp(y0, y1, i / rows), p = torsoAt(b, theta, Math.max(y, fall), ease);
    p[1] = y;
    if (o.close && i === 0) { p[0] = 0; p[2] = (torsoAt(b, 0, y)[2] + torsoAt(b, Math.PI, y)[2]) / 2; }
    return { p, u: theta / tau, v: y, w: trunkWeights(b, p), slot, c: [0, y, p[2] * .3], d: o.hang ? swing : undefined };
  };
  return sheet(rows, cols, at, o.skip && ((i, j) => o.skip!(at(i + .5, j + .5).p)));
}

/** A patch of cloth lying on the torso: a pocket, placket or buckle. */
function patch(b: Build, theta0: number, theta1: number, y0: number, y1: number, ease: number, slot: number) {
  return sheet(3, 3, (i, j) => {
    const theta = lerp(theta0, theta1, j / 3), y = lerp(y0, y1, i / 3), p = torsoAt(b, theta, y, ease);
    return { p, u: theta / tau, v: y, w: trunkWeights(b, p), slot, c: [0, y, 0] };
  });
}

/**
 * Cloth over one quarter of the torso, front or back of one side, between edges that move with height
 * (distances from the centre line): waistcoat and bundi panels with smooth armholes and necklines, the apron.
 */
function panel(b: Build, y0: number, y1: number, ease: number, slot: number, back: boolean, side: number,
  edges: (y: number, w: number) => number[], fall = 0) {
  const rows = Math.max(2, Math.round((y1 - y0) / .022)), cols = 7, swing = hang(b);
  return sheet(rows, cols, (i, j) => {
    const y = lerp(y0, y1, i / rows), [, w, , , n] = interpolate(b.torso, Math.max(y, fall)), [inner, outer] = edges(y, w + ease);
    const x = lerp(inner, Math.min(outer, w + ease), j / cols), a = Math.asin(Math.min(1, x / (w + ease)) ** (n / 2));
    const theta = side * (back ? Math.PI - a : a), p = torsoAt(b, theta, Math.max(y, fall), ease);
    p[1] = y;
    return { p, u: theta / tau, v: y, w: trunkWeights(b, p), slot, c: [0, y, p[2] * .3], d: fall ? swing : undefined };
  });
}
/** Four panels around the torso: front edges from the neckline out, back edges from the back of the neck out. */
function shell(b: Build, y0: number, y1: number, ease: number, slot: number, front: (y: number, w: number) => number[],
  back: (y: number, w: number) => number[], fall = 0) {
  return [-1, 1].flatMap(side => [panel(b, y0, y1, ease, slot, false, side, front, fall), panel(b, y0, y1, ease, slot, true, side, back, fall)]);
}

/** Scales a limb table drawn for the man ([distance below the joint, half width, half depth]) to a build. */
function limbRows(rows: number[][], b: Build, arm: boolean) {
  const [a, c] = arm ? [b.upper, b.forearm] : [b.thigh, b.shin], [ma, mc] = arm ? [.295, .245] : [.42, .41], r = arm ? b.arm : b.leg;
  return rows.map(([d, rx, rz]) => [d <= ma ? d * a / ma : a + (d - ma) * c / mc, rx * r, rz * r]);
}
const armTable = [[-.026,.004,.004],[-.022,.02,.022],[-.015,.032,.035],[-.005,.041,.044],[.012,.047,.05],[.045,.049,.05],[.09,.046,.046],
  [.15,.043,.043],[.21,.04,.041],[.26,.037,.038],[.295,.035,.036],[.33,.038,.037],[.38,.036,.033],[.43,.032,.029],[.48,.028,.025],
  [.525,.021,.026],[.56,.019,.024]];

/** A tube down an arm or leg from the joint at its top. */
function limb(joint: T.Vector3, rows: number[][], d0: number, d1: number, slot: number, w: (y: number) => Weights,
  o: { ease?: (d: number) => number; wave?: (theta: number, d: number) => number; cols?: number } = {}) {
  const cols = o.cols ?? 12, n = Math.max(2, Math.round((d1 - d0) / .03));
  return sheet(n, cols, (i, j) => {
    const d = lerp(d1, d0, i / n), theta = (j / cols - .5) * tau;
    const [, rx, rz] = interpolate(rows, d), e = o.ease?.(d) ?? 0, r = 1 + (o.wave?.(theta, d) ?? 0);
    const [x, z] = ellipse(theta, (rx + e) * r, (rz + e) * r), y = joint.y - d;
    return { p: [joint.x + x, y, joint.z + z], u: theta / tau * .25, v: y, w: w(y), slot, c: [joint.x, y, joint.z] };
  });
}

/** Loose cloth hanging around both legs from the waist: shirt tails, kurta and kameez skirts, the saree. */
function skirt(b: Build, rows: number[][], slot: number, o: { y0?: number; y1?: number; slit?: number; pleats?: number;
  folds?: number; ease?: number; follow?: number } = {}) {
  const swing = hang(b, o.follow);
  const cols = 34, y0 = o.y0 ?? rows[0][0], y1 = o.y1 ?? rows[rows.length - 1][0], n = Math.max(2, Math.round((y1 - y0) / .034));
  const at = (i: number, j: number): Vert => {
    const theta = (j / cols - .5) * tau, y = lerp(y0, y1, i / n), [, w, f, k] = interpolate(rows, y), c = Math.cos(theta);
    const hem = down(y, rows[0][0], rows[rows.length - 1][0] - .05);
    // Soft vertical folds deepen towards the hem; saree pleats fan out at the front.
    const fold = 1 + (o.folds ?? 0) * hem * Math.sin(theta * 7 + 1.1) + (o.ease ?? 0);
    const [x, z] = ellipse(theta, w * fold, (c > 0 ? f : k) * fold, 2.1);
    const pleat = o.pleats && c > .75 ? o.pleats * hem * ss(c, .75, .95) * Math.abs(((theta * 17 / Math.PI) % 2 + 3) % 2 - 1) : 0;
    return { p: [x, y, z + pleat], u: theta / tau, v: y, w: trunkWeights(b, [x, y]), slot, c: [0, y, 0], d: swing };
  };
  const slits = [Math.round(cols / 4 - .5), Math.round(3 * cols / 4 - .5)];
  return sheet(n, cols, at, o.slit === undefined ? undefined : (i, j) => slits.includes(j) && lerp(y0, y1, (i + .5) / n) < o.slit!);
}

/**
 * A strip of cloth laid over the torso along a path of [theta, height, half width]: a dupatta or pallu.
 * Below `hang` it falls straight from where the body is fullest.
 */
function drape(b: Build, path: number[][], slot: number, ease: number, fall: number, follow = 1) {
  const steps = path.length * 4, R = .14;
  const along = (s: number) => {
    const f = s * (path.length - 1), i = Math.min(Math.floor(f), path.length - 2), t = f - i;
    const a = path[Math.max(i - 1, 0)], p = path[i], q = path[i + 1], d = path[Math.min(i + 2, path.length - 1)];
    return p.map((_, k) => .5 * (2 * p[k] + (q[k] - a[k]) * t + (2 * a[k] - 5 * p[k] + 4 * q[k] - d[k]) * t * t + (3 * p[k] - a[k] - 3 * q[k] + d[k]) * t ** 3));
  };
  const swing = hang(b, follow);
  return sheet(steps, 4, (i, j) => {
    const s = i / steps, [theta, y, hw] = along(s), [t1, y1] = along(Math.min(1, s + .01)), [t0, y0] = along(Math.max(0, s - .01));
    const dt = (t1 - t0) * R, dy = y1 - y0, l = Math.hypot(dt, dy) || 1, across = (j / 2 - 1) * hw;
    const th = theta - dy / l * across / R, yy = y + dt / l * across;
    const p = torsoAt(b, th, Math.max(yy, fall), ease + .004 * Math.abs(j - 2));
    p[1] = yy;
    return { p, u: across, v: s * steps * .05, w: trunkWeights(b, p), slot, c: [0, yy, p[2] * .2], d: swing };
  });
}

/** A tube along a polyline with parallel-transported rings: fingers and thumb. */
function tube(points: V3[], radii: number[], sides: number, w: Weights, slot: number, flat = 1) {
  const P = points.map(p => new T.Vector3(...p)), tangents = P.map((p, i) => P[Math.min(i + 1, P.length - 1)].clone().sub(P[Math.max(i - 1, 0)]).normalize());
  let normal = new T.Vector3(1, 0, 0).cross(tangents[0]).normalize();
  const frames = tangents.map(t => (normal = normal.clone().sub(t.clone().multiplyScalar(normal.dot(t))).normalize()));
  return sheet(points.length - 1, sides, (i, j) => {
    const a = j / sides * tau, n = frames[i], bi = tangents[i].clone().cross(n);
    const q = P[i].clone().addScaledVector(n, Math.cos(a) * radii[i]).addScaledVector(bi, Math.sin(a) * radii[i] * flat);
    return { p: q.toArray() as V3, u: j / sides, v: i, w, slot, c: points[i] };
  });
}

/**
 * A relaxed hand hanging at the side, fingers loosely curled and the thumb resting forward of the index. With `grip` the fingers
 * close round a bar running along the hand's thumb side, 3 cm in front of the palm and 9 cm past the wrist (canonical frame).
 */
function hand(b: Build, i: number, grip = 0) {
  const j = bindJoints(b), elbow = j[Bone.elbow(i)], s = i * 2 - 1, k = b.hand;
  const wrist = new T.Vector3(elbow.x, elbow.y - b.forearm, elbow.z), w: Weights = [Bone.elbow(i), 1];
  // Canonical right hand: palm towards +x, thumb towards +z, wrist at the origin.
  const place = (p: V3): V3 => [wrist.x - s * p[0] * k, wrist.y + p[1] * k, wrist.z + p[2] * k];
  const palmRows = [[-.106,0,0],[-.102,.024,.008],[-.094,.039,.012],[-.08,.043,.0135],[-.055,.041,.015],[-.025,.036,.016],[0,.028,.016],[.014,.024,.015]];
  const palm = sheet(palmRows.length - 1, 10, (r, c) => {
    const [y, hz, hx] = palmRows[r], theta = (c / 10 - .5) * tau;
    const [z, x] = ellipse(theta, hz, hx, 2.6);
    // The ball of the thumb fills the lower palm beside it.
    const thenar = .007 * Math.max(0, Math.cos(theta)) * ss(z, .0, .03) * Math.exp(-(((y + .035) / .028) ** 2));
    return { p: place([x + thenar + .001, y, z]), u: c / 10, v: y, w, slot: Slot.skin, c: place([0, y, 0]) };
  });
  const pieces = [palm];
  const fingers = [[.0265,-.089,[.043,.025,.019],.0088],[.0085,-.094,[.047,.029,.021],.0091],[-.0095,-.092,[.044,.027,.02],.0086],[-.026,-.085,[.035,.021,.017],.0076]] as const;
  fingers.forEach(([z, y, lengths, radius], f) => {
    const curl = [lerp(.24, .45, grip) + .07 * f, lerp(.42, 1.15, grip) + .06 * f, lerp(.3, .8, grip) + .04 * f], spread = (1.2 - f) * .045;
    const dir = new T.Vector3(0, -1, 0).applyAxisAngle(new T.Vector3(1, 0, 0), -spread), at = new T.Vector3(.001, y + .012, z);
    const points: V3[] = [at.toArray() as V3], radii: number[] = [radius];
    lengths.forEach((length, n) => {
      dir.applyAxisAngle(dir.clone().cross(new T.Vector3(1, 0, 0)).normalize(), curl[n]);
      points.push(at.addScaledVector(dir, length).toArray() as V3);
      radii.push(radius * (1 - .1 * n - .06));
    });
    points.push(at.clone().addScaledVector(dir, radius * .6).toArray() as V3, at.clone().addScaledVector(dir, radius * .95).toArray() as V3);
    radii.push(radius * .6, 0);
    pieces.push(tube(points.map(place), radii.map(r => r * k), 5, w, Slot.skin, .86));
  });
  const thumbDir = new T.Vector3(lerp(.2, .55, grip), -.72, .66).normalize(), thumbAt = new T.Vector3(.004, -.018, .026), thumb: V3[] = [thumbAt.toArray() as V3];
  const thumbRadii = [.0125];
  [.036, .03, .026].forEach((length, n) => {
    thumbDir.applyAxisAngle(thumbDir.clone().cross(new T.Vector3(1, .2, 0)).normalize(), n ? .3 : .1);
    thumb.push(thumbAt.addScaledVector(thumbDir, length).toArray() as V3); thumbRadii.push(.0115 - .0014 * n);
  });
  thumb.push(thumbAt.clone().addScaledVector(thumbDir, .0055).toArray() as V3, thumbAt.clone().addScaledVector(thumbDir, .009).toArray() as V3);
  thumbRadii.push(.0058, 0);
  pieces.push(tube(thumb.map(place), thumbRadii.map(r => r * k), 5, w, Slot.skin, .85));
  return pieces;
}

/** The bare neck, rising from inside the collar into the head. */
function neck(b: Build) {
  const j = bindJoints(b), r = b.female ? .045 : .053, y0 = j[2].y - .075, y1 = j[2].y + .05;
  return sheet(6, 14, (i, c) => {
    const y = lerp(y0, y1, i / 6), theta = (c / 14 - .5) * tau, z0 = lerp(-.012, .012, i / 6);
    const [x, z] = ellipse(theta, r * (1 - .06 * i / 6), r * .93 * (1 - .05 * i / 6));
    return { p: [x, y, z + z0], u: theta / tau * .25, v: y, w: trunkWeights(b, [x, y]), slot: Slot.skin, c: [0, y, z0] };
  });
}

/** A shirt collar: a stand around the neck and a fall that turns down onto the yoke, ending in two points. */
function collar(b: Build, slot: number, stand = false) {
  const top = bindJoints(b)[2].y - .01, n = 20, open = stand ? .24 : .34;
  return sheet(stand ? 1 : 2, n, (i, c) => {
    const theta = lerp(open, tau - open, c / n), point = ss(Math.abs(theta - Math.PI), Math.PI - .9, Math.PI - open);
    const [r, y] = stand ? [[.061, top - .04], [.059, top - .005]][i] : [[.06, top - .045], [.066, top - .004], [.088 + .012 * point, top - .052 - .035 * point]][i];
    const [x, z] = ellipse(theta, r, r * .95);
    return { p: [x, y, z - .006], u: theta * .07, v: y, w: trunkWeights(b, [x, y]), slot, c: [0, y - .03, -.006] };
  });
}

/** Sleeve: a loose tube over the shoulder ending in an open hem, or a cuffed full sleeve. */
function sleeve(b: Build, i: number, end: number, slot: number, loose: number) {
  const joint = bindJoints(b)[Bone.shoulder(i)], rows = limbRows(armTable, b, true);
  const ease = (d: number) => ss(d, -.028, -.008) * (.006 + loose * ss(d, .02, Math.max(.05, end)));
  return limb(joint, rows, -.026, end, slot, armWeights(b, i), { ease, cols: 14 });
}
function arm(b: Build, i: number, from: number, grip: number) {
  const joint = bindJoints(b)[Bone.shoulder(i)], rows = limbRows(armTable, b, true);
  return [limb(joint, rows, from, b.upper + b.forearm + .012, Slot.skin, armWeights(b, i)), ...hand(b, i, grip)];
}
function cuff(b: Build, i: number, slot: number) {
  const joint = bindJoints(b)[Bone.shoulder(i)], rows = limbRows(armTable, b, true), end = b.upper + b.forearm - .018;
  return limb(joint, rows, end - .055, end, slot, armWeights(b, i), { ease: () => .013, cols: 14 });
}
/** A trouser, pyjama, salwar or jeans leg from inside the hips to its hem. */
function leg(b: Build, i: number, table: number[][], slot: number, wave?: (theta: number, d: number) => number) {
  const joint = bindJoints(b)[Bone.hip(i)];
  return limb(joint, limbRows(table, b, false), -.09, table[table.length - 1][0] * (b.thigh + b.shin) / .83, slot, legWeights(b, i), { wave, cols: 12 });
}

const trousers = [[-.09,.066,.07],[-.03,.074,.078],[.03,.078,.083],[.1,.081,.086],[.18,.076,.08],[.26,.069,.073],[.34,.063,.066],
  [.42,.058,.061],[.5,.056,.058],[.58,.055,.056],[.66,.054,.055],[.74,.055,.056],[.8,.057,.059],[.835,.059,.062]];
const pyjama = [[-.09,.066,.07],[-.03,.074,.078],[.03,.079,.083],[.1,.083,.086],[.2,.08,.081],[.3,.075,.075],[.42,.07,.07],
  [.55,.066,.066],[.68,.063,.063],[.78,.061,.061],[.832,.06,.06]];
const jeans = [[-.09,.064,.07],[-.03,.072,.077],[.03,.076,.081],[.1,.076,.08],[.18,.07,.074],[.26,.063,.066],[.34,.056,.059],
  [.42,.052,.054],[.5,.05,.051],[.58,.046,.047],[.66,.042,.043],[.74,.04,.041],[.8,.041,.042],[.83,.042,.043]];
const salwar = [[-.09,.066,.07],[-.03,.074,.079],[.04,.082,.086],[.12,.088,.09],[.2,.09,.09],[.28,.089,.088],[.36,.087,.085],
  [.44,.085,.082],[.52,.075,.072],[.6,.062,.059],[.67,.052,.05],[.72,.047,.045],[.765,.046,.044],[.8,.047,.045]];

export type Outfit = "shirt" | "formal" | "kurta" | "crew" | "riding" | "salwar" | "saree" | "kurti" | "apron" | "jacket" | "dupatta" | "veil";

/** Every garment of an outfit, with the skin it shows, as one skinned surface in the build's bind pose; `grip` closes the hands. */
export function outfitGeometry(kind: Outfit, grip = 0) {
  const female = kind === "salwar" || kind === "saree" || kind === "kurti" || kind === "dupatta" || kind === "veil";
  const b = builds[female ? "woman" : "man"], j = bindJoints(b), { upper, lower, accent, skin } = Slot;
  const waist = j[1].y, neckBase = b.torso[b.torso.length - 1][0], g: T.BufferGeometry[] = [];
  const arms = (end: number, loose: number, slot = upper, full = false) => {
    for (const i of [0, 1]) {
      g.push(sleeve(b, i, end, slot, loose));
      if (full) g.push(cuff(b, i, slot), ...hand(b, i, grip), limb(j[Bone.shoulder(i)], limbRows(armTable, b, true), b.upper + b.forearm - .05, b.upper + b.forearm + .012, skin, armWeights(b, i)));
      else g.push(...arm(b, i, end - .04, grip));
    }
  };
  const legs = (table: number[][], slot = lower, wave?: (theta: number, d: number) => number) => { for (const i of [0, 1]) g.push(leg(b, i, table, slot, wave)); };
  switch (kind) {
    case "shirt": case "crew": {
      g.push(trunk(b, j[0].y - .12, waist + .03, 0, lower, { close: true }), trunk(b, waist - .02, neckBase, .006, upper), neck(b));
      g.push(skirt(b, [[.80,.179,.109,.133],[.84,.178,.108,.132],[.88,.176,.107,.13],[.93,.171,.107,.123],[.98,.162,.108,.109],[1.03,.153,.108,.1]], upper,
        { folds: .012 }));
      if (kind === "shirt") g.push(collar(b, upper), patch(b, -.07, .07, waist, neckBase - .02, .0085, upper), patch(b, .38, .78, 1.17, 1.29, .009, upper));
      arms(kind === "crew" ? .17 : .2, .016);
      legs(trousers);
      if (kind === "crew") {
        // A hi-vis waistcoat: armholes and a V at the neck, two reflective hoops and braces.
        const armhole = (y: number, w: number) => lerp(w, .108, ss(y, 1.2, 1.28));
        const vest = (y0: number, y1: number, slot: number) => g.push(...shell(b, y0, y1, .02, slot,
          (y, w) => [Math.max(0, (y - 1.1) * .25), armhole(y, w)], (y, w) => [.065 * ss(y, 1.38, 1.43), armhole(y, w)]));
        vest(.86, .98, accent); vest(.98, 1.03, Slot.reflective); vest(1.03, 1.08, accent); vest(1.08, 1.13, Slot.reflective); vest(1.13, neckBase + .01, accent);
        for (const s of [-1, 1]) g.push(patch(b, s * .34, s * .5, 1.13, 1.33, .024, Slot.reflective));
      }
      break;
    }
    case "riding":
      // A motorcyclist's zipped jacket: padded, hip length over the trousers, full sleeves and a stand collar.
      g.push(trunk(b, j[0].y - .12, waist + .03, 0, lower, { close: true }), trunk(b, waist - .02, neckBase, .016, upper), neck(b));
      g.push(skirt(b, [[.80,.19,.12,.144],[.84,.189,.119,.143],[.88,.187,.118,.141],[.93,.182,.118,.134],[.98,.173,.119,.12],[1.03,.164,.118,.11]], upper,
        { folds: .008 }));
      g.push(collar(b, upper, true), patch(b, -.016, .016, .8, neckBase - .01, .0185, Slot.dark));
      arms(b.upper + b.forearm - .025, .012, upper, true);
      legs(trousers);
      break;
    case "formal":
      g.push(trunk(b, j[0].y - .12, waist + .02, 0, lower, { close: true }), trunk(b, waist - .015, neckBase, .007, upper), neck(b));
      g.push(trunk(b, waist - .022, waist + .016, .014, Slot.dark), patch(b, -.09, .09, waist - .018, waist + .012, .019, Slot.reflective));
      g.push(collar(b, upper), patch(b, -.07, .07, waist + .01, neckBase - .02, .0095, upper), patch(b, .38, .78, 1.17, 1.29, .0105, upper));
      arms(b.upper + b.forearm - .025, .008, upper, true);
      legs(trousers);
      break;
    case "kurta":
      g.push(trunk(b, j[0].y - .12, waist + .03, 0, lower, { close: true }), trunk(b, waist - .02, neckBase, .009, upper), neck(b));
      g.push(skirt(b, [[.47,.214,.138,.145],[.55,.209,.134,.142],[.64,.202,.128,.138],[.73,.194,.121,.134],[.82,.184,.112,.13],[.89,.176,.107,.124],
        [.96,.166,.107,.112],[1.03,.156,.11,.101]], upper, { slit: .8, folds: .02 }));
      g.push(collar(b, upper, true), patch(b, -.055, .055, 1.16, neckBase - .02, .011, upper));
      arms(b.upper + b.forearm - .02, .012, upper, true);
      legs(pyjama);
      break;
    case "salwar": case "kurti": {
      const kameez = kind === "salwar";
      g.push(trunk(b, j[0].y - .105, waist + .03, 0, lower, { close: true }), trunk(b, waist - .02, neckBase, .007, upper), neck(b));
      g.push(skirt(b, (kameez ? [[.45,.204,.128,.142],[.53,.2,.124,.14],[.62,.197,.118,.138],[.71,.192,.112,.136]] : [[.64,.19,.11,.136],[.71,.188,.108,.135]])
        .concat([[.79,.186,.104,.134],[.85,.18,.1,.13],[.90,.165,.096,.115],[.95,.146,.092,.097],[1.0,.134,.091,.089]]), upper, { slit: .79, folds: .016 }));
      arms(b.upper + .06, .01);
      if (kameez) legs(salwar, lower, (theta, d) => .07 * Math.sin(theta * 9 + d * 20) * ss(d, .45, .66) * down(d, .7, .74));
      else legs(jeans);
      break;
    }
    case "saree": {
      g.push(trunk(b, waist + .025, neckBase, .006, upper), trunk(b, waist - .03, waist + .035, 0, skin), neck(b));
      const pleated = { pleats: .012, follow: .55 };
      const rows = [[.012,.183,.138,.13],[.03,.182,.137,.129],[.08,.178,.134,.127],[.17,.17,.129,.124],[.28,.163,.124,.122],[.40,.159,.119,.122],
        [.52,.158,.114,.124],[.64,.161,.109,.127],[.74,.167,.104,.13],[.81,.173,.099,.13],[.86,.171,.097,.125],[.91,.157,.094,.108],[.96,.137,.091,.092]];
      g.push(skirt(b, rows, lower, { ...pleated, y0: .085 }), skirt(b, rows, accent, { ...pleated, y1: .085 }));
      arms(.11, .006);
      // The pallu rises from the right hip across the chest, over the left shoulder and down the back.
      g.push(drape(b, [[-.55,.985,.09],[-.2,1.07,.11],[.25,1.16,.1],[.7,1.24,.07],[1.571,1.31,.035],[2.2,1.24,.09],[2.4,1.05,.12],[2.45,.8,.13],[2.45,.52,.13]], lower, .014, .84, -.55));
      g.push(drape(b, [[2.45,.53,.13],[2.45,.505,.13],[2.45,.48,.13]], accent, .014, .84, -.55));
      break;
    }
    case "apron": {
      // A cashier's bib apron: the bib below the collar, the skirt hanging straight from the hips, a neck strap and waist ties.
      for (const side of [-1, 1]) g.push(panel(b, .55, 1.27, .022, upper, false, side, y => [0, lerp(.17, .1, ss(y, waist - .01, waist + .07))], .9));
      g.push(trunk(b, waist - .015, waist + .012, .02, upper, { skip: ([, , z]) => z > 0 }));
      g.push(drape(b, [[.55,1.27,.012],[1.2,1.36,.012],[1.571,1.425,.012],[2.4,1.42,.012],[Math.PI,1.415,.012],[3.88,1.42,.012],[4.71,1.425,.012],[5.08,1.36,.012],[5.73,1.27,.012]], upper, .024, 0));
      break;
    }
    case "jacket": {
      // A sleeveless bundi with a stand collar, open in a deep V over the kurta or shirt.
      const armhole = (y: number, w: number) => lerp(w, .114, ss(y, 1.17, 1.26));
      g.push(...shell(b, .86, neckBase + .008, .026, upper, (y, w) => [Math.max(.004, (y - 1.12) * .22), armhole(y, w)],
        (y, w) => [.062 * ss(y, 1.4, 1.445), armhole(y, w)]));
      break;
    }
    case "dupatta":
      // Across the chest and over both shoulders, the two ends hanging apart down the back.
      g.push(drape(b, [[2.25,.6,.06],[2.25,.85,.06],[2.2,1.1,.055],[2.05,1.25,.042],[1.571,1.318,.028],[.85,1.25,.038],[.45,1.15,.046],[0,1.1,.05],
        [-.45,1.15,.046],[-.85,1.25,.038],[-1.571,1.318,.028],[-2.05,1.25,.042],[-2.2,1.1,.055],[-2.25,.85,.06],[-2.25,.6,.06]], accent, .016, .84, -1));
      break;
    case "veil": g.push(veil(b)); break;
  }
  return weld(mergeGeometries(g));
}

/**
 * A dupatta drawn over the head: loose over the crown, framing the face, then falling from below the ears
 * over the shoulders, longest down the back and over the chest, with soft folds towards the hem.
 */
function veil(b: Build) {
  const j = bindJoints(b), head = j[2], k = b.head, rows = 18, cols = 32, shoulder = j[Bone.shoulder(0)].y;
  const jaw = head.y + .03 * k;
  return sheet(rows, cols, (i, c) => {
    const v = i / rows, onHead = v < .5, t = (v - .5) / .5;
    const opening = onHead ? lerp(0, 1.18, ss(v, .1, .36)) : lerp(1.18, .82, ss(t, 0, 1));
    const theta = lerp(opening, tau - opening, c / cols), back = Math.max(0, -Math.cos(theta)), front = Math.max(0, Math.cos(theta));
    let p: V3;
    if (onHead) {
      const q = skullPoint(theta, lerp(.257, .03, v / .5)), n = new T.Vector3(q.x, (q.y - .12) * .55, q.z).normalize();
      q.addScaledVector(n, .02 + .016 * ss(v, .15, .5));
      p = [head.x + q.x * k, head.y + q.y * k, head.z + q.z * k];
    } else {
      const hem = shoulder - .02 - .16 * back ** 1.5 - .12 * front ** 2, y = lerp(jaw, hem, t);
      const ring = (yy: number) => torsoAt(b, theta, yy, .035), q = skullPoint(theta, .03);
      const fold = 1 + .045 * ss(t, .3, 1) * Math.sin(theta * 9 + 1.7);
      if (y > shoulder) {
        const f = (jaw - y) / (jaw - shoulder), r = ring(shoulder);
        p = [lerp(head.x + q.x * k * 1.22, r[0] * 1.05, f), y, lerp(head.z + (q.z * 1.22 - .008) * k, r[2] * 1.05, f)];
      } else {
        const r = ring(y);
        p = [r[0] * 1.05, y, r[2] * 1.05];
      }
      p[0] *= fold; p[2] *= fold;
    }
    const h = onHead ? 1 : down(t, .05, .45);
    return { p, u: theta * .1, v: -v, w: [Bone.head, h, Bone.chest, 1 - h], slot: Slot.accent, c: [head.x, Math.min(p[1], head.y + .1), head.z] };
  });
}

// ---------------------------------------------------------------- rigid pieces (instanced on one joint)

/** A loft along the foot: rows of [z, half width, top, bottom] in the ankle joint's frame. */
function loft(rows: number[][], slot: number, n: number, cols = 10) {
  return sheet(rows.length - 1, cols, (i, c) => {
    const [z, hw, top, bottom] = rows[i], theta = (c / cols) * tau, cy = (top + bottom) / 2;
    const [x, y] = ellipse(theta, hw, (top - bottom) / 2, n);
    return { p: [x, cy + y, z], u: x, v: z, w: [Bone.foot(0), 1], slot, c: [0, cy, z] };
  });
}

export type Footwear = "shoes" | "sandals";
/** A man's shoe or a sandal with the bare foot, around the ankle joint; one geometry serves both feet. */
export function footwearGeometry(kind: Footwear) {
  const g: T.BufferGeometry[] = [];
  if (kind === "shoes") {
    g.push(loft([[-.071,.004,-.028,-.052],[-.068,.022,-.006,-.054],[-.06,.031,.006,-.055],[-.042,.037,.011,-.055],[-.012,.04,.012,-.055],
      [.028,.043,.002,-.055],[.068,.046,-.014,-.055],[.108,.047,-.025,-.055],[.148,.044,-.033,-.055],[.174,.036,-.039,-.055],
      [.191,.022,-.045,-.055],[.198,.004,-.049,-.055]], Slot.leather, 3));
    g.push(loft([[-.074,.004,-.051,-.065],[-.071,.026,-.051,-.065],[-.055,.037,-.051,-.065],[-.01,.043,-.051,-.065],[.07,.05,-.051,-.065],
      [.15,.048,-.051,-.065],[.185,.036,-.051,-.065],[.2,.02,-.051,-.065],[.204,.004,-.052,-.064]], Slot.sole, 6));
  } else {
    const foot = [[-.064,.004,-.036,-.052],[-.06,.02,-.01,-.053],[-.05,.027,.03,-.053],[-.03,.03,.05,-.053],[-.005,.031,.05,-.053],
      [.025,.034,.018,-.053],[.06,.039,-.016,-.053],[.1,.043,-.033,-.053],[.135,.044,-.04,-.053],[.16,.04,-.044,-.053],[.18,.032,-.047,-.053],
      [.193,.018,-.049,-.053],[.198,.004,-.05,-.053]];
    g.push(loft(foot, Slot.skin, 2.4));
    g.push(loft([[-.072,.004,-.053,-.065],[-.069,.026,-.053,-.065],[-.05,.034,-.053,-.065],[0,.037,-.053,-.065],[.08,.049,-.053,-.065],
      [.15,.05,-.053,-.065],[.19,.04,-.053,-.065],[.206,.022,-.053,-.065],[.21,.004,-.054,-.064]], Slot.sole, 8));
    // A broad strap across the instep.
    g.push(sheet(2, 10, (i, c) => {
      const z = lerp(.052, .088, i / 2), [, hw, top, bottom] = interpolate(foot, z), cy = (top + bottom) / 2, theta = lerp(-Math.PI / 2 - .25, Math.PI / 2 + .25, c / 10);
      const [x, y] = ellipse(theta, hw + .0035, (top - bottom) / 2 + .0035, 2.4);
      return { p: [x, cy + Math.max(y, -.004), z], u: x, v: z, w: [Bone.foot(0), 1], slot: Slot.strap, c: [0, cy, z] };
    }));
  }
  return weld(mergeGeometries(g));
}

export type Hair = "crop" | "bun" | "plait" | "curls";
/**
 * Hair with real volume over the scalp, in the head joint's frame. Hairlines follow the portraits:
 * men's crops are fuller on top, women's hair is drawn back from a centre parting.
 */
export function hairGeometry(style: Hair) {
  const woman = style !== "crop", curls = style === "curls";
  // Hairline height around the head (angle from the face): men's temples recede and the cut clears the ears;
  // women's hair is drawn back over the tops of the ears; curls fall to the jaw and the nape.
  const line = curls ? [[0,.206],[.5,.196],[.9,.15],[1.2,.06],[1.6,.02],[2.2,.0],[Math.PI,-.03]]
    : woman ? [[0,.212],[.5,.2],[.9,.16],[1.2,.115],[1.5,.095],[1.9,.08],[2.4,.055],[Math.PI,.045]]
    : [[0,.207],[.5,.2],[.75,.19],[.95,.165],[1.1,.1],[1.25,.1],[1.42,.142],[1.75,.142],[2.0,.1],[2.5,.056],[Math.PI,.045]];
  const g: T.BufferGeometry[] = [];
  g.push(surface(12, 32, (u, v) => {
    const a = (u - .5) * tau, front = Math.cos(a), side = Math.abs(Math.sin(a)), start = interpolate(line, Math.abs(a))[1];
    const y = lerp(start, .257, v * v * (3 - 2 * v) * .6 + v * .4), p = skullPoint(a, Math.max(y, .02));
    if (y < .02) p.y = y;
    // Volume: fuller on top and at the crown, close-cropped over the ears, thinning out to the hairline.
    let lift = curls ? .016 + .008 * Math.max(0, -front) + .006 * ss(y, .12, .24) + .005 * Math.sin(a * 11 + y * 55) * Math.sin(y * 64 + a * 4)
      : woman ? .0055 + .002 * front * ss(y, .18, .24)
      : .0035 + .0085 * ss(y, .16, .235) + .004 * Math.max(0, -front) * ss(y, .08, .2) - .0015 * side * (1 - ss(y, .14, .2));
    // Parting: a centre line for women, a side part for men, faint grooves where the comb has passed.
    const part = woman ? Math.exp(-((p.x / .004) ** 2)) * ss(front, .2, .6) : Math.exp(-(((p.x - .034) / .005) ** 2)) * ss(front, .1, .5) * ss(y, .19, .23);
    lift = lift * ss(y - start, 0, curls ? .02 : .026) - (curls ? 0 : .003 * part) + (curls ? 0 : .001 * Math.sin(a * 23 + y * 90) * ss(y - start, 0, .02));
    const n = new T.Vector3(p.x, (p.y - .12) * .55, p.z).normalize();
    // u runs around the head, across the strands: the material stretches the highlight along it.
    return { p: p.addScaledVector(n, lift + .0015), u, v: y * 4 };
  }));
  const lump = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0, twist = 0) => {
    const s = new T.SphereGeometry(1, 9, 7), p = s.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), r = 1 + twist * Math.sin(Math.atan2(pz, px) * 3 + py * 4);
      p.setXYZ(i, px * r, py, pz * r);
    }
    s.scale(sx, sy, sz).rotateZ(rz).translate(x, y, z);
    s.computeVertexNormals();
    return s;
  };
  if (style === "bun" || style === "plait") g.push(lump(0, .088, -.109, .024, .028, .02));
  if (style === "bun") g.push(lump(0, .078, -.122, .048, .04, .034, 0, .08));
  if (style === "plait") {
    // Three strands crossing down the spine: alternate lumps lean left and right.
    for (let n = 0; n < 12; n++) {
      const y = .06 - n * .036, z = -.098 - .036 * ss(n, 0, 5);
      g.push(lump((n % 2 ? .006 : -.006), y, z, .021 - n * .0006, .026, .017, n % 2 ? .45 : -.45));
    }
  }
  return mergeGeometries(g);
}

export type Helmet = "full-face" | "open-face";
/** Outer shell of a helmet at height y in head units: half width, front and back depth. A round dome above the ears. */
function helmetRing(y: number) {
  if (y > .13) { const s = Math.sqrt(Math.max(0, 1 - ((y - .13) / .176) ** 2)); return [.15 * s, .172 * s, .176 * s]; }
  const t = (.13 - y) / .18;
  return [.15 - .032 * t * t, .172 - .022 * t * t, .176 - .05 * t ** 1.5];
}
/**
 * A motorcycle helmet in the head joint's frame (like hair), at real size: the shell stands 4-5 cm clear of the skull and
 * 3.5 cm over the ears, about 0.27 m wide and 0.31 m long on a man. Full-face: the shell runs on past the chin as the chin
 * bar and a smoked visor covers the eye port. Open-face: the shell opens from the brow to the jaw, a strap runs under the
 * jaw and `visor` is the clear visor hanging in front of the face. A rubber trim turns the edge in to meet the neck or face.
 * `shell` carries vertex colours: `paint`, dark trim and fittings, the smoked visor.
 */
export function helmetGeometry(style: Helmet, paint: string) {
  const full = style === "full-face", top = .306, rows = 16, cols = 48, head: Weights = [Bone.head, 1], inside: V3 = [0, .12, -.005];
  const point = (theta: number, y: number, out = 0): V3 => {
    const [w, f, k] = helmetRing(y), [x, z] = ellipse(theta, w + out, (Math.cos(theta) > 0 ? f : k) + out, 2.3);
    return [x, y, z - .005];
  };
  // The lower edge: below the chin all round (full-face), or rising to the brow across the face (open-face).
  const edge = (theta: number) => {
    const a = Math.abs(theta), low = lerp(full ? -.045 : .02, -.005, ss(a, full ? .6 : 1.6, full ? 2.4 : 3));
    return full ? low : lerp(low, .205, down(a, .95, 1.35));
  };
  const shellPoint = (i: number, c: number) => {
    const theta = (c / cols - .5) * tau, e = edge(theta);
    return point(theta, top - (top - e) * (1 - Math.cos(i / rows * Math.PI / 2)));
  };
  const g = [weld(sheet(rows, cols, (i, c) => ({ p: shellPoint(i, c), u: 0, v: 0, w: head, slot: 0, c: inside }))),
    weld(sheet(1, cols, (i, c) => {
      let p = shellPoint(rows, c);
      if (i) {
        // The liner closes on the skin all round the opening (the neck below a full-face), so nothing shows through the shell.
        const q = skullPoint((c / cols - .5) * tau, T.MathUtils.clamp(p[1], 0, .25)), r = Math.hypot(p[0], p[2] + .005);
        const s = (full ? .078 : Math.max(Math.hypot(q.x, q.z + .005), .062) + .006) / r;
        p = [p[0] * s, p[1] + .012, (p[2] + .005) * s - .005];
      }
      return { p, u: 0, v: 0, w: head, slot: 1, c: inside };
    }))];
  for (const s of [-1, 1]) g.push(new T.CylinderGeometry(.021, .023, .006, 14).rotateX(Math.PI / 2).rotateY(s * 1.38).translate(...point(s * 1.38, .152, .003)));
  let visor: T.BufferGeometry | undefined;
  if (full) g.push(sheet(6, 24, (i, c) => {
    const u = c / 12 - 1, h = .05 * (1 - Math.abs(u) ** 6) ** (1 / 6);
    return { p: point(1.2 * u, .152 + h * (i / 3 - 1), .0045), u: 0, v: 0, w: head, slot: 2, c: inside };
  }));
  else {
    visor = sheet(8, 28, (i, c) => {
      const u = c / 14 - 1;
      return { p: point(1.4 * u, lerp(lerp(-.03, .11, Math.abs(u) ** 2.4), .214, i / 8), .012), u: 0, v: 0, w: head, slot: 0, c: inside };
    });
    for (const s of [-1, 1]) g.push(tube([[s * .125, .045, -.015], [s * .065, .012, 0], [s * .045, -.008, .045], [0, -.016, .066]], [.005, .005, .005, .005], 5, head, 3));
  }
  const colours = [paint, "#1f2123", "#0b0f12", "#2a2724"].map(c => new T.Color(c));
  const tinted = (part: T.BufferGeometry) => {
    const n = part.getAttribute("position").count, slot = part.getAttribute("slot"), color = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) colours[slot ? slot.getX(k) : 1].toArray(color, k * 3);
    return new T.BufferGeometry().setIndex(part.getIndex()).setAttribute("position", part.getAttribute("position"))
      .setAttribute("normal", part.getAttribute("normal")).setAttribute("color", new T.BufferAttribute(color, 3));
  };
  return { shell: mergeGeometries(g.map(tinted)), visor: visor && tinted(visor) };
}
