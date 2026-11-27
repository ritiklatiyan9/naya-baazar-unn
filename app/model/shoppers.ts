import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Bone, Slot, bindJoints, builds, footwearGeometry, hairGeometry, helmetGeometry, outfitGeometry, portraitGeometry, shopperHeadGeometry,
  shopperPortraits, type Build, type Footwear, type Hair, type Helmet, type Outfit, type V3 } from "./shopperAppearance";
import { sunProjection, sunShadowMaterial } from "./realism";

export type PersonPose = {
  x: number; z: number; floorY: number; heading: number;
  stride: number; walking: number; browsing: number; time: number;
  tillHand?: number;
  carrying?: number;
  crouch?: number;
};

/** Pieces carried rigidly by one joint: head, face, hair, footwear, bags, crockery and the distant silhouette. */
type Rigid = "head" | "face" | Hair | Footwear | "bag" | "ring" | "cup" | "oval" | "shadow" | "silhouette";
type Part = { actor: Shopper; joint: T.Object3D; form: Rigid; color: string; local: T.Matrix4 };

const lathe = (rings: number[][], sides: number) => new T.LatheGeometry(rings.map(([r, h]) => new T.Vector2(r, h)), sides);
function rigidGeometry(form: Rigid): T.BufferGeometry {
  switch (form) {
    case "head": return shopperHeadGeometry();
    case "face": return portraitGeometry();
    case "shoes": case "sandals": return footwearGeometry(form);
    case "bag": return new T.BoxGeometry(1, 1, 1);
    case "ring": return new T.TorusGeometry(.5, .055, 5, 12);
    case "cup": return lathe([[0,0],[.032,0],[.036,.005],[.045,.070],[.045,.081],[.041,.081],[.039,.073],[.031,.013],[0,.013]], 16);
    case "oval": return new T.SphereGeometry(.5, 10, 7);
    // A rounded six-sided solid. The colour and proportions of each joint define its distant silhouette.
    case "silhouette": return lathe([[0,-.5],[.36,-.44],[.50,-.19],[.48,.29],[.33,.45],[0,.5]], 6);
    case "shadow": return new T.PlaneGeometry(1, 1);
    default: return hairGeometry(form);
  }
}

export function contactTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!;
  const falloff = c.createRadialGradient(32, 32, 1, 32, 32, 32);
  falloff.addColorStop(0, "rgba(35,30,26,.43)");
  falloff.addColorStop(.38, "rgba(35,30,26,.28)");
  falloff.addColorStop(1, "rgba(35,30,26,0)");
  c.fillStyle = falloff;
  c.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

// A Shamli market crowd: muted everyday shirts and trousers, white kurtas, and the strong traditional
// colours of kameez, dupatta and saree. Cheek midtones of the eight portraits keep neck and hands continuous with each face.
const palettes = {
  shirt: ["#ece9e1","#dce2e5","#a9bfd4","#7d9cc0","#c7cbcd","#d6c9ad","#dcbcbb","#b3a6c4","#a5bea9","#78784f","#6f2c33","#2e3b58","#c39858","#5b7c8c","#e9e3d3"],
  line: ["#33435e","#7b2b2b","#2f5240","#5a4a3a","#ffffff","#1f2a44"],
  trousers: ["#2a2c30","#1e1f23","#2e3344","#48494d","#a4937a","#594839","#3a4862","#33405a","#5d5f63"],
  kurta: ["#f1ede2","#ebe2cd","#dde4e8","#ede0b4","#d7e1cd","#c9d6e2","#f3efe6"],
  pyjama: ["#f0ece2","#e8e0cc","#f4f1ea"],
  jacket: ["#2a2622","#4a3a2e","#3a3e45","#6a2830","#283651","#8a6a2c","#2e4838"],
  kameez: ["#7a1f2b","#c4922c","#1f5a43","#b8195a","#1c5e78","#cc632a","#5a2a6d","#e2ad98","#e3a0b5","#8db5d4","#ece3cf","#9a2e3e","#2d6e5d","#d9c36a"],
  salwar: ["#f0eadf","#2a2a2e","#e7d9c0","#d8cdb8"],
  dupatta: ["#e6c049","#de7ca6","#efe4cd","#be3a2e","#2e8a76","#ef9f5a","#8f56a8","#f3efe6","#c6345a"],
  saree: ["#9d1a31","#1e6a4f","#1e4d8b","#d39c2a","#c45a12","#ad2f69","#59307f","#2b7879","#8a1d3e","#e0b0a0"],
  border: ["#d4a53a","#b12a2a","#1e6a3a","#e3bb4e","#efe2c4"],
  kurti: ["#2e6d8d","#e0ad4a","#7b3b96","#cf5353","#efe3d4","#4b8a49","#e486a3","#1b3a5b","#f0d9a8"],
  jeans: ["#3a4c6a","#2b3954","#1e1f24","#56698a","#f0ece2","#7a2333"],
  crew: ["#2f3f4c","#33424d"],
  vest: ["#e58a2a","#e6902e"],
  apron: ["#365650","#514a45","#775743","#3e5264"],
  leather: ["#2a1f1a","#3a291f","#1b1a1a","#583a27"],
  sneaker: ["#e6e4de","#d6d6d4","#2a3954","#55595f"],
  chappalSole: ["#3a2f28","#5a4535","#1f1c1a","#7a5b42"],
  strap: ["#4a3424","#1f1c1a","#7a2a2a","#2a4a6a","#c7a36a","#8a5a7a"],
  hair: ["#17120f","#1d1814","#271f19"],
  grey: ["#7b756e","#8e8981","#66615b"],
  bag: ["#c2a87c","#ab704e","#e4e0d6","#d27b98","#3c6c8d","#bb986d"],
};
const skinTones = ["#ca957c", "#bc8871", "#c49075", "#c38b73", "#bb836e", "#bf8874", "#c9957d", "#c79279"];

/** Seeded choices, never Math.random: every visit to the market meets the same people. */
function hash(seed: number, salt: number) {
  let h = Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}
const chance = (seed: number, salt: number) => hash(seed, salt) / 4294967296;
const pick = <V,>(list: readonly V[], seed: number, salt: number) => list[hash(seed, salt) % list.length];
/** sRGB bytes packed exactly into one float: the shader unpacks the four colours of an instance from one attribute. */
export const pack = (hex: string) => parseInt(hex.slice(1), 16);
/** The portrait (0-7) a seed wears; odd cells are men, cells 2 and 5 the older woman and man. */
const faceCell = (seed: number) => (seed * 5 + Math.floor(seed / 8)) % 8;

function joint(parent: T.Object3D, at: T.Vector3) {
  const result = new T.Object3D();
  result.position.copy(at);
  parent.add(result);
  return result;
}

/**
 * The joints of a build in its bind pose, `bones` in Bone order: root (on the floor, facing +z) → pelvis → chest → head,
 * pelvis → hip → knee → ankle and chest → shoulder → elbow per side (index 0 on −x). Pose by rotating joints.
 */
export function figureRig(b: Build) {
  const j = bindJoints(b), root = new T.Object3D(), bones: T.Object3D[] = [];
  const at = (i: number, parent: T.Object3D, from = -1) => (bones[i] = joint(parent, j[i].clone().sub(from < 0 ? new T.Vector3() : j[from])));
  const pelvis = at(Bone.pelvis, root), chest = at(Bone.chest, pelvis, Bone.pelvis), head = at(Bone.head, chest, Bone.chest);
  head.scale.setScalar(b.head);
  const legs = [0, 1].map(i => {
    const hip = at(Bone.hip(i), pelvis, Bone.pelvis), knee = at(Bone.knee(i), hip, Bone.hip(i));
    return { hip, knee, foot: at(Bone.foot(i), knee, Bone.knee(i)) };
  });
  const arms = [0, 1].map(i => {
    const shoulder = at(Bone.shoulder(i), chest, Bone.chest);
    return { shoulder, elbow: at(Bone.elbow(i), shoulder, Bone.shoulder(i)) };
  });
  return { root, bones, pelvis, chest, head, legs, arms };
}

const bindInverses = new Map<Build, T.Matrix4[]>();
/** Inverse bind matrices: a skinned vertex follows each joint from where it was modelled. */
export function bindInverse(b: Build) {
  let inverse = bindInverses.get(b);
  if (!inverse) {
    inverse = bindJoints(b).map((p, i) => new T.Matrix4().makeTranslation(p.x, p.y, p.z)
      .multiply(new T.Matrix4().makeScale(...(i === Bone.head ? [b.head, b.head, b.head] as const : [1, 1, 1] as const))).invert());
    bindInverses.set(b, inverse);
  }
  return inverse;
}

const fullTurn = 2 * Math.PI;
const ankleTarget = new T.Vector3(), inversePelvis = new T.Quaternion();
const palmTarget = new T.Vector3(), inverseChest = new T.Quaternion();
const xAxis = new T.Vector3(1, 0, 0), yAxis = new T.Vector3(0, 1, 0);

/**
 * Two-bone IK for a limb resting along -y from `top`: writes the upper bone's rotation so the end reaches `target` (clamped
 * to the limb's reach), the middle joint bulging towards `pole`, and returns the hinge angle about the upper bone's x.
 * The lower bone folds towards the upper's +z for `fold` 1 (elbow, rotation -angle), -z for -1 (knee, rotation +angle).
 */
function reach(top: T.Vector3, target: T.Vector3, a: number, b: number, pole: T.Vector3, fold: number, out: T.Quaternion) {
  const axis = target.clone().sub(top), d = T.MathUtils.clamp(axis.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  axis.normalize();
  const bulge = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (bulge.lengthSq() < 1e-8) bulge.crossVectors(axis, Math.abs(axis.y) < .9 ? yAxis : xAxis);
  bulge.normalize();
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const mid = top.clone().addScaledVector(axis, a * cos).addScaledVector(bulge, a * Math.sqrt(Math.max(0, 1 - cos * cos)));
  const y = top.clone().sub(mid).normalize(), lower = top.clone().addScaledVector(axis, d).sub(mid).normalize();
  const z = lower.clone().addScaledVector(y, -lower.dot(y));
  if (z.lengthSq() < 1e-8) z.copy(bulge).negate();
  z.normalize().multiplyScalar(fold);
  out.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().crossVectors(y, z), y, z));
  return Math.acos(T.MathUtils.clamp(-y.dot(lower), -1, 1));
}

/** Each figure is a skinned outfit over thirteen joints, plus the rigid pieces those joints carry. */
class Shopper {
  root: T.Object3D;
  build: Build;
  bones: T.Object3D[];
  pelvis: T.Object3D; chest: T.Object3D; head: T.Object3D;
  legs: { hip: T.Object3D; knee: T.Object3D; foot: T.Object3D }[];
  arms: { shoulder: T.Object3D; elbow: T.Object3D }[];
  bag?: T.Object3D;
  tableware?: T.Object3D;
  parts: Part[] = [];
  visible = true;
  detailed = true;
  portraitIndex: number;
  outfit: Outfit;
  overlay?: Outfit;
  /** Packed upper, lower, accent and skin colours of the outfit, its overlay and the footwear. */
  palette: number[]; overlayPalette: number[] = []; footPalette: number[];
  pattern = 0;
  /** `wear` replaces the seeded main outfit (a kind of the figure's own gender); the seed still picks its colours. */
  constructor(readonly seed: number, readonly row: number, readonly dinerIndex: number, crew: boolean, cashier: boolean, wear?: Outfit) {
    let cell = faceCell(seed);
    // Crews and cashiers are men; odd portrait cells are men's faces.
    if ((crew || cashier) && cell % 2 === 0) cell += 1;
    this.portraitIndex = cell;
    const female = cell % 2 === 0, older = cell === 2 || cell === 5, b = this.build = builds[female ? "woman" : "man"];
    const r = (salt: number) => chance(seed, salt), c = <V,>(list: readonly V[], salt: number) => pick(list, seed, salt);
    const skin = skinTones[cell];

    // ---- what they wear
    let upper: string, lower: string, accent: string, footwear: Footwear, hair: Hair | undefined, hairColor: string;
    if (female) {
      const roll = r(1);
      this.outfit = wear ?? (dinerIndex >= 0 ? (roll < .5 ? "kurti" : "salwar") : older ? (roll < .6 ? "saree" : "salwar") : roll < .5 ? "salwar" : roll < .75 ? "saree" : "kurti");
      if (this.outfit === "saree") { lower = c(palettes.saree, 2); accent = c(palettes.border, 3); upper = r(4) < .5 ? lower : c(palettes.kameez, 4); }
      else if (this.outfit === "salwar") { upper = c(palettes.kameez, 2); lower = r(3) < .4 ? upper : c(palettes.salwar, 3); accent = c(palettes.dupatta, 4); }
      else { upper = c(palettes.kurti, 2); lower = c(palettes.jeans, 3); accent = upper; }
      if (this.outfit === "salwar" && r(5) < .3) this.pattern = 3;
      // The dupatta lies over the shoulders, or is drawn over the head; with a saree the pallu covers the head.
      const veiled = this.outfit !== "kurti" && r(6) < (older ? .65 : this.outfit === "saree" ? .35 : .22);
      if (veiled) this.overlay = "veil";
      else if (this.outfit === "salwar" ? r(18) < .88 : this.outfit === "kurti" && r(18) < .2) this.overlay = "dupatta";
      if (this.overlay) this.overlayPalette = [accent, accent, this.outfit === "saree" ? lower : accent, skin].map(pack);
      footwear = this.outfit === "kurti" ? (r(7) < .5 ? "shoes" : "sandals") : r(7) < .85 ? "sandals" : "shoes";
      hair = this.overlay === "veil" ? undefined : cell === 4 ? "curls" : cell === 2 || r(8) < .55 ? "bun" : "plait";
      hairColor = cell === 2 ? c(palettes.grey, 9) : c(palettes.hair, 9);
    } else {
      const roll = r(1);
      this.outfit = wear ?? (crew ? "crew" : cashier || dinerIndex >= 0 ? (roll < .5 ? "shirt" : "formal")
        : older ? (roll < .5 ? "kurta" : roll < .8 ? "formal" : "shirt") : roll < .45 ? "shirt" : roll < .8 ? "formal" : "kurta");
      if (this.outfit === "crew") { upper = c(palettes.crew, 2); lower = "#36424c"; accent = c(palettes.vest, 3); }
      else if (this.outfit === "kurta") { upper = c(palettes.kurta, 2); lower = c(palettes.pyjama, 3); accent = upper; }
      else if (this.outfit === "riding") { upper = c(palettes.jacket, 2); lower = c(palettes.trousers, 3); accent = upper; }
      else {
        upper = c(palettes.shirt, 2); lower = c(palettes.trousers, 3); accent = c(palettes.line, 4);
        const roll2 = r(5);
        if (!cashier && roll2 < .34) this.pattern = roll2 < .2 ? 1 : 2;
      }
      if (cashier) { this.overlay = "apron"; const canvas = c(palettes.apron, 6); this.overlayPalette = [canvas, canvas, canvas, skin].map(pack); }
      else if (this.outfit !== "crew" && this.outfit !== "riding" && r(6) < (this.outfit === "kurta" ? .35 : .1)) {
        this.overlay = "jacket"; const cloth = c(palettes.jacket, 7); this.overlayPalette = [cloth, cloth, cloth, skin].map(pack);
      }
      footwear = this.outfit === "crew" || this.outfit === "formal" || this.outfit === "riding" ? "shoes" : this.outfit === "kurta" ? (r(8) < .7 ? "sandals" : "shoes") : r(8) < .4 ? "sandals" : "shoes";
      hair = "crop";
      hairColor = cell === 5 ? c(palettes.grey, 9) : c(palettes.hair, 9);
    }
    this.palette = [upper, lower, accent, skin].map(pack);
    const sneaker = footwear === "shoes" && !crew && this.outfit !== "formal" && r(10) < .5;
    const shoeColor = footwear === "sandals" ? c(palettes.chappalSole, 11) : sneaker ? c(palettes.sneaker, 11) : c(palettes.leather, 11);
    this.footPalette = [shoeColor, sneaker ? "#ecebe6" : footwear === "sandals" ? shoeColor : "#231c18", c(palettes.strap, 12), skin].map(pack);

    // ---- the rig, matching the bind pose of the outfit
    ({ root: this.root, bones: this.bones, pelvis: this.pelvis, chest: this.chest, head: this.head, legs: this.legs, arms: this.arms } = figureRig(b));
    const j = bindJoints(b);
    // Standing heights: men 1.61-1.77 m, women 1.49-1.63 m.
    const height = female ? .935 + .09 * r(13) : .94 + .095 * r(13), breadth = .95 + .11 * r(14);
    this.root.scale.set(height * breadth, height, height * breadth);
    // Heads keep their proportions whatever the build: undo the root's breadth on the head joint.
    const headScale = b.head * (1 + .025 * (r(15) - .5));
    this.head.scale.set(headScale / breadth, headScale, headScale / breadth);

    // ---- rigid pieces
    const transform = new T.Object3D();
    const put = (jt: T.Object3D, form: Rigid, color: string, x: number, y: number, z: number,
      sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
      transform.position.set(x, y, z);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      this.parts.push({ actor: this, joint: jt, form, color, local: transform.matrix.clone() });
    };
    put(this.root, "shadow", "#ffffff", 0, .009, .025, .72, 1.08, 1, -Math.PI / 2);
    put(this.head, "head", skin, 0, 0, 0, 1, 1, 1);
    put(this.head, "face", "#ffffff", 0, 0, 0, 1, 1, 1);
    if (hair) put(this.head, hair, hairColor, 0, 0, 0, 1, 1, 1);
    const foot = b.hand;
    for (const { foot: ankle } of this.legs) put(ankle, footwear, "#ffffff", 0, 0, 0, foot, foot, foot);
    if (female && r(16) < .45) for (const s of [-1, 1]) put(this.head, "oval", "#c9a55a", s * .1, .066, -.004, .009, .012, .009);
    if (cashier) put(this.chest, "bag", "#d4c3a4", -.052, .262, .131, .057, .023, .006);
    const shoppingBag = !crew && !cashier && dinerIndex < 0 && (seed % 4 === 0 || seed % 5 === 1);
    const arm = this.arms[0], hand = b.forearm + .07 * b.hand;
    if (shoppingBag) {
      this.bag = joint(arm.elbow, new T.Vector3(0, -hand, .005));
      const paper = c(palettes.bag, 17);
      put(this.bag, "silhouette", paper, -.035, -.169, 0, .14, .24, .23);
      put(this.bag, "ring", "#ad8b63", -.018, -.022, 0, .100, .12, .18, 0, Math.PI / 2);
      put(this.bag, "bag", paper, -.035, -.169, 0, .12, .23, .22, 0, -.07);
    }
    if (dinerIndex >= 0) {
      const grip = this.tableware = joint(this.arms[1].elbow, new T.Vector3(0, -(b.forearm + .05), .016));
      if (dinerIndex % 2 === 0) {
        put(grip, "cup", "#f1e5cf", -.065, -.033, 0, 1, 1, 1);
        put(grip, "oval", "#785039", -.065, .042, 0, .081, .003, .081);
        put(grip, "ring", "#e5d7bd", -.014, .012, 0, .052, .048, .085);
      } else {
        put(grip, "bag", "#b2aba1", 0, 0, .003, .014, .12, .007, -.18);
        put(grip, "oval", "#b9b6aa", 0, .062, -.010, .029, .043, .011);
        put(grip, "oval", "#c7935c", 0, .077, -.016, .037, .028, .028);
      }
    }

    // ---- the distant silhouette, which is also the sun-shadow caster
    const skirtTo = this.outfit === "saree" ? .02 : this.outfit === "kurta" || this.outfit === "salwar" ? j[4].y + .02 : this.outfit === "kurti" ? .64 : j[0].y - .1;
    const top = female ? .32 : .36, chestY = j[1].y, waist = top * .48, wide = female ? .3 : .34;
    // The outermost layer gives the distant colour: a bundi or apron over the shirt, the hi-vis over the T-shirt.
    const coat = this.overlay === "jacket" || this.overlay === "apron" ? `#${this.overlayPalette[0].toString(16).padStart(6, "0")}` : crew ? accent : upper;
    put(this.chest, "silhouette", coat, 0, waist, 0, wide, top, female ? .2 : .23);
    const skirtTop = chestY + .02, skirtHeight = skirtTop - skirtTo, long = skirtTo < j[0].y - .11;
    const inSkirt = this.outfit === "saree" ? lower : long ? upper : coat;
    put(this.pelvis, "silhouette", inSkirt, 0, (skirtTop + skirtTo) / 2 - j[0].y, -.005, long ? .42 : .34, skirtHeight, long ? .3 : .23);
    put(this.chest, "silhouette", skin, 0, j[2].y - chestY - .03, -.005, .095, .11, .1);
    put(this.head, "silhouette", skin, 0, .123, .006, .211, .262, .224);
    put(this.head, "silhouette", this.overlay === "veil" ? (this.outfit === "saree" ? lower : accent) : hairColor, 0, .202, -.014, .23, .155, .235);
    if (hair === "bun" || hair === "plait") put(this.head, "silhouette", hairColor, 0, hair === "bun" ? .078 : -.12, -.12, .09, hair === "bun" ? .08 : .4, .07);
    const sleeve = this.outfit === "formal" || this.outfit === "kurta" ? 1 : this.outfit === "saree" ? .35 : this.outfit === "salwar" || this.outfit === "kurti" ? 1.12 : .62;
    for (const i of [0, 1]) {
      const { hip, knee, foot: ankle } = this.legs[i], { shoulder, elbow } = this.arms[i];
      put(hip, "silhouette", lower, 0, -b.thigh / 2, 0, .17, b.thigh + .07, .18);
      put(knee, "silhouette", lower, 0, -b.shin / 2, -.007, .15, b.shin + .02, .155);
      put(ankle, "silhouette", palettes.leather[0], 0, -.04, .055, .1, .07, .26);
      put(shoulder, "silhouette", sleeve > .5 ? upper : skin, 0, -b.upper / 2 + .02, 0, .112, b.upper + .06, .112);
      put(elbow, "silhouette", sleeve > 1.05 || sleeve === 1 ? upper : skin, 0, -b.forearm / 2 - .02, .008, .09, b.forearm + .1, .09);
    }
  }

  private sit(p: PersonPose) {
    // Distinct periods and pauses let table companions listen, eat and look up in turn.
    const phase = T.MathUtils.euclideanModulo(p.time / (8.7 + this.seed % 5) + this.seed * .379, 1);
    const lift = T.MathUtils.smoothstep(phase, .18, .36) * (1 - T.MathUtils.smoothstep(phase, .49, .73));
    const conversation = Math.sin(p.time * .68 + this.seed) * (1 - lift);
    const b = this.build, ankle = b.pelvis - .01 - b.thigh - b.shin;
    this.pelvis.position.set(0, .45 / this.root.scale.y + .065, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.chest.rotation.set(.073 + .025 * conversation, .061 * conversation, -.018 * conversation);
    this.head.rotation.set(.11 * lift + .032 * Math.sin(p.time * 1.12 + this.seed),
      .22 * conversation - .10 * lift, .023 * conversation);
    for (let i = 0; i < this.legs.length; i++) {
      const {hip, knee, foot} = this.legs[i];
      // The thigh tips down just enough for the feet to rest on the paving below a 45 cm seat.
      const shin = .1 + i * .07, drop = this.pelvis.position.y - .01 - ankle - b.shin * Math.cos(shin);
      const tilt = Math.asin(T.MathUtils.clamp(drop / b.thigh, 0, .5));
      hip.rotation.set(-(Math.PI / 2 - tilt) - i * .03, 0, (i * 2 - 1) * .07);
      knee.rotation.set(Math.PI / 2 - tilt + i * .03 - shin, 0, 0);
      foot.rotation.set(-hip.rotation.x - knee.rotation.x, (i * 2 - 1) * .11, 0);
    }
    const resting = this.arms[0], eating = this.arms[1];
    resting.shoulder.rotation.set(-.26 - .08 * conversation, .03, -.12);
    resting.elbow.rotation.set(-1.17 - .08 * conversation, 0, 0);
    eating.shoulder.rotation.set(-.47 - .64 * lift, -.12 - .51 * lift, .06);
    eating.elbow.rotation.set(-1.29 - 1.12 * lift, 0, 0);
    const grip = this.tableware!;
    // Keep the crockery upright through elbow flexion, then tip the rim for the sip.
    grip.quaternion.copy(this.chest.quaternion).multiply(eating.shoulder.quaternion)
      .multiply(eating.elbow.quaternion).invert();
    grip.rotateX(this.dinerIndex % 2 === 0 ? -.33 * lift : -.68 * lift);
    this.root.updateMatrixWorld(true);
  }

  private workAtTill(p: PersonPose, tillHand: number) {
    const cycle = T.MathUtils.euclideanModulo(p.time / (7.7 + this.seed % 3) + this.seed * .36, 1);
    const tap = T.MathUtils.smoothstep(cycle, .02, .20) * (1 - T.MathUtils.smoothstep(cycle, .38, .52));
    const wrap = T.MathUtils.smoothstep(cycle, .42, .60) * (1 - T.MathUtils.smoothstep(cycle, .77, .94));
    const nod = Math.sin(p.time * 1.2 + this.seed);
    this.chest.rotation.set(.08 + .07 * tap + .055 * wrap, tillHand * (.048 * tap - .046 * wrap), .014 * nod);
    this.head.rotation.set(.035 + .25 * tap + .21 * wrap + .018 * nod,
      tillHand * (.12 * tap - .17 * wrap + .070 * nod), .015 * nod);
    this.root.updateMatrixWorld(true);
    inverseChest.copy(this.chest.quaternion).invert();
    for (let i = 0; i < this.arms.length; i++) {
      const side = i * 2 - 1, operatesTill = side === tillHand;
      const { shoulder, elbow } = this.arms[i];
      // Reach from the same paving and worktop heights as the terminal, then look back up at a customer.
      const screenTap = operatesTill ? tap * (.014 * Math.cos(p.time * 13) + .032) : 0;
      palmTarget.set(side * (operatesTill ? .134 - .055 * tap : .175 + .049 * wrap),
        operatesTill ? .999 + .135 * tap + screenTap : .975 + .043 * wrap,
        operatesTill ? .387 + .067 * tap : .398 + .095 * wrap);
      palmTarget.x /= this.root.scale.x;
      palmTarget.y /= this.root.scale.y;
      palmTarget.z /= this.root.scale.z;
      palmTarget.sub(this.pelvis.position).applyQuaternion(inversePelvis)
        .sub(this.chest.position).applyQuaternion(inverseChest).sub(shoulder.position);
      const reach = Math.hypot(palmTarget.x, palmTarget.z);
      const upper = this.build.upper, forearm = this.build.forearm + .055 * this.build.hand;
      const distance = T.MathUtils.clamp(Math.hypot(reach, palmTarget.y), .12, upper + forearm - .001);
      const shoulderBend = Math.acos(T.MathUtils.clamp((upper ** 2 + distance ** 2 - forearm ** 2) / (2 * upper * distance), -1, 1));
      shoulder.rotation.set(shoulderBend - Math.atan2(reach, -palmTarget.y),
        Math.atan2(palmTarget.x, palmTarget.z), 0, "YXZ");
      elbow.rotation.x = -Math.acos(T.MathUtils.clamp((distance ** 2 - upper ** 2 - forearm ** 2) / (2 * upper * forearm), -1, 1));
    }
  }

  pose(p: PersonPose) {
    const wave = p.walking, browse = p.browsing, b = this.build, female = b.female;
    const idle = Math.sin(p.time * 1.4 + this.seed);
    this.root.position.set(p.x, p.floorY, p.z);
    this.root.rotation.y = p.heading;
    if (this.dinerIndex >= 0) {
      this.sit(p);
      return;
    }

    // Women take shorter, quicker steps (shortest in a saree). Scaling step length and cadence together keeps
    // the planted foot still on the paving.
    const cadence = female ? (this.outfit === "saree" ? 1.28 : 1.13) : 1;
    const phase = p.stride * cadence + this.seed * 1.73;
    const step = Math.cos(phase), weight = Math.sin(phase);
    const rest = (1 - wave) * (.72 + .28 * Math.sin(p.time * .57 + this.seed)) * (this.seed % 2 ? 1 : -1);
    const crouch = T.MathUtils.clamp(p.crouch ?? 0, 0, 1);
    // Hip height for a nearly straight standing leg, the double bob of the walk, and the crouch.
    const leg = b.thigh + b.shin, ankle = b.pelvis - .01 - leg, base = ankle + .01;
    this.pelvis.position.set(
      .021 * rest - .021 * weight * wave,
      T.MathUtils.lerp(base + leg * .977 + idle * .002, base + leg * (.945 - .034 * Math.cos(2 * phase)), wave) - .24 * leg * crouch,
      -.084 * crouch,
    );
    // The pelvis drops on the swing side; women's hips roll a little more.
    this.pelvis.rotation.set(0, .066 * step * wave + .04 * rest, -(female ? .046 : .036) * weight * wave - .03 * rest);
    inversePelvis.copy(this.pelvis.quaternion).invert();
    this.chest.rotation.set(.046 * wave + .085 * browse + .01 * idle + .32 * crouch,
      -.131 * step * wave - .06 * rest, .047 * weight * wave + .044 * rest);
    const glance = Math.sin(p.time * .69 + this.seed) * (.15 * browse + .048 * (1 - wave));
    // The head counters the shoulders' swing so the gaze stays level along the route.
    this.head.rotation.set(.13 * browse + .022 * idle - .09 * crouch - .03 * wave, .068 * step * wave + glance, .022 * browse - .02 * weight * wave);

    // During stance the ankle travels backwards at the speed of the root. The swing
    // returns it to the next heel strike with the same tangent as the planted foot.
    const stance = .55, strideLength = 1.38 / cadence / this.root.scale.z, foot = b.hand;
    for (let i = 0; i < this.legs.length; i++) {
      const { hip, knee, foot: ankleJoint } = this.legs[i];
      const side = i * 2 - 1;
      const cycle = T.MathUtils.euclideanModulo(phase / fullTurn + i * .5, 1);
      const swing = T.MathUtils.clamp((cycle - stance) / (1 - stance), 0, 1);
      const arch = Math.sin(Math.PI * swing);
      const swingProgress = swing * swing * (3 - 2 * swing);
      const forward = cycle <= stance ? strideLength * (stance * .5 - cycle) :
        strideLength * (stance * (swingProgress - .5) - (1 - stance) * swing * (1 - swing) * (1 - 2 * swing));
      const pitch = wave * (cycle < stance ?
        -.19 * (1 - T.MathUtils.smoothstep(cycle, 0, .13)) + .49 * T.MathUtils.smoothstep(cycle, .32, stance) :
        .49 - .68 * T.MathUtils.smoothstep(swing, .08, .88));
      // Roll about the heel or toe during contact, leaving the sole tangent to the paving.
      const ankleY = foot * (.064 * Math.cos(pitch) + Math.sin(pitch) * (pitch > 0 ? .19 : -.068));
      ankleTarget.set(side * ((female ? .077 : .089) + .026 * crouch + .013 * arch * wave),
        ankleY + arch * wave * (.144 - .028 * swing),
        forward * wave + side * .036 * rest);
      ankleTarget.sub(this.pelvis.position).applyQuaternion(inversePelvis).sub(hip.position);
      const down = Math.hypot(ankleTarget.x, ankleTarget.y);
      const distance = T.MathUtils.clamp(Math.hypot(ankleTarget.z, down), .28, leg - .001);
      const hipFlex = -Math.atan2(ankleTarget.z, down) -
        Math.acos(T.MathUtils.clamp((b.thigh ** 2 + distance ** 2 - b.shin ** 2) / (2 * b.thigh * distance), -1, 1));
      const kneeFlex = Math.acos(T.MathUtils.clamp((distance ** 2 - b.thigh ** 2 - b.shin ** 2) / (2 * b.thigh * b.shin), -1, 1));
      const roll = Math.atan2(ankleTarget.x, -ankleTarget.y);
      hip.rotation.set(hipFlex, 0, roll, "ZXY");
      knee.rotation.x = kneeFlex;
      ankleJoint.rotation.set(pitch - hipFlex - kneeFlex, side * .058, -roll - this.pelvis.rotation.z);
    }
    // Arms swing against the legs; the forearm lags the upper arm and flexes most as it comes forward.
    const reachSwing = female ? .27 : .34, hang = female ? .13 : .095;
    for (let i = 0; i < this.arms.length; i++) {
      const { shoulder, elbow } = this.arms[i];
      const side = i * 2 - 1, swing = -side * step, lagged = -side * Math.cos(phase - .45);
      const reach = i === 1 ? browse : 0;
      shoulder.rotation.set(reachSwing * swing * wave - .66 * reach - .06 * (1 - wave),
        -side * .074, side * (hang + .026 * wave + .011 * idle));
      elbow.rotation.x = -.2 - .3 * (.5 + .5 * Math.max(-1, -lagged)) * wave - .63 * reach +
        .045 * idle * reach - .05 * (1 - wave) * (this.seed % 3);
    }
    if (this.bag) {
      this.bag.scale.setScalar(p.carrying === undefined && p.crouch === undefined ? 1 : .0001);
      const arm = this.arms[0];
      this.bag.rotation.x = -.72 * (arm.shoulder.rotation.x + arm.elbow.rotation.x) + .10 * weight * wave;
    }
    if (p.tillHand) this.workAtTill(p, p.tillHand);
    if (p.carrying || p.crouch) {
      const bend = crouch;
      const grip = T.MathUtils.clamp(p.carrying ?? 0, 0, 1);
      for (let i = 0; i < this.arms.length; i++) {
        const { shoulder, elbow } = this.arms[i];
        const side = i * 2 - 1;
        shoulder.rotation.set(T.MathUtils.lerp(shoulder.rotation.x,-.31 - .26 * bend,grip),
          T.MathUtils.lerp(shoulder.rotation.y,side * .035,grip),T.MathUtils.lerp(shoulder.rotation.z,side * .108,grip));
        elbow.rotation.x = T.MathUtils.lerp(elbow.rotation.x,-1.16 + .25 * bend,grip);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * Seats the figure for occupantFigure, the root fixed at the vehicle's origin. Limbs are solved in the unscaled rig (targets
   * divided by the root's height and breadth scale), so every target lands exactly once the scale is restored. Returns the
   * thighs' and shins' forward swing against the pelvis and the thighs' directions in its frame (for cloth over the lap), and
   * each forearm's pronation.
   */
  seat(spec: OccupantSpec) {
    const b = this.build, scale = this.root.scale.clone(), rig = (v: V3) => new T.Vector3(...v).divide(scale);
    this.root.scale.set(1, 1, 1);
    // The pelvis and the spine share the lean; the head keeps the eyes on the road, dipped a little.
    const pelvisQ = this.pelvis.quaternion.setFromEuler(new T.Euler(spec.lean * .5, spec.yaw ?? 0, 0, "YXZ"));
    this.pelvis.position.copy(rig(spec.pelvis)).add(new T.Vector3(0, .01, 0).applyQuaternion(pelvisQ));
    this.chest.quaternion.setFromAxisAngle(xAxis, spec.lean * .5);
    this.head.quaternion.setFromEuler(new T.Euler(-spec.lean, spec.look ?? 0, 0)).multiply(new T.Quaternion().setFromAxisAngle(xAxis, .07));
    this.root.updateMatrixWorld(true);
    const chestQ = pelvisQ.clone().multiply(this.chest.quaternion), inverse = pelvisQ.clone().invert(), limb = new T.Quaternion();
    const legs = [0, 0, 0, 0], twist = [0, 0], thighs: T.Vector3[] = [];
    for (let i = 0; i < 2; i++) {
      const side = i * 2 - 1, { hip, knee, foot } = this.legs[i];
      // Knees forward and a little out and up.
      const bend = reach(new T.Vector3().setFromMatrixPosition(hip.matrixWorld), rig(i ? spec.feet.left : spec.feet.right), b.thigh, b.shin,
        new T.Vector3(side * .2, .3, 1).applyQuaternion(pelvisQ), -1, limb);
      hip.quaternion.copy(inverse).multiply(limb);
      knee.quaternion.setFromAxisAngle(xAxis, bend);
      const kneeQ = limb.clone().multiply(knee.quaternion);
      const thigh = new T.Vector3(0, -1, 0).applyQuaternion(limb), shin = new T.Vector3(0, -1, 0).applyQuaternion(kneeQ);
      // Toes point along the thigh, turned out a little; the sole stays level until the shin slopes forward to a pedal.
      const toe = new T.Vector3(0, 0, .3).applyQuaternion(pelvisQ).add(thigh).setY(0).normalize().applyAxisAngle(yAxis, side * .12);
      const pitch = T.MathUtils.clamp(Math.atan2(shin.dot(toe), -shin.y) - .25, 0, .9);
      const sole = toe.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(yAxis, Math.sin(pitch));
      const lift = yAxis.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(toe, -Math.sin(pitch));
      foot.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().crossVectors(lift, sole), lift, sole)).premultiply(kneeQ.invert());
      thighs.push(thigh.applyQuaternion(inverse));
      shin.applyQuaternion(inverse);
      legs[i] = Math.atan2(thigh.z, -thigh.y); legs[2 + i] = Math.atan2(shin.z, -shin.y);
    }
    // Hands close round their targets, elbows down and out. The grip lies in the curl of the fingers, off the forearm's line,
    // so the reach is refined a few times; the forearm turns the palm to face its direction, by default down and forward.
    for (let i = 0; i < 2; i++) {
      const side = i * 2 - 1, { shoulder, elbow } = this.arms[i], k = b.hand, palm = new T.Vector3(...(spec.palms?.[i ? "left" : "right"] ?? [0, -.8, .6]));
      const top = new T.Vector3().setFromMatrixPosition(shoulder.matrixWorld), goal = rig(i ? spec.hands.left : spec.hands.right), aim = goal.clone();
      const grip = new T.Vector3(-side * .031 * k, -b.forearm - .093 * k, 0), pole = new T.Vector3(side * .55, -1, -.3).applyQuaternion(chestQ);
      for (let n = 0; n < 4; n++) {
        elbow.quaternion.setFromAxisAngle(xAxis, -reach(top, aim, b.upper, grip.length(), pole, 1, limb));
        const forearmQ = limb.clone().multiply(elbow.quaternion), d = palm.clone().applyQuaternion(forearmQ.clone().invert());
        twist[i] = T.MathUtils.clamp(Math.atan2(side * d.z, -side * d.x), -1.7, 1.7);
        const at = new T.Vector3(0, -b.upper, 0).applyQuaternion(limb).add(top).add(grip.clone().applyAxisAngle(yAxis, twist[i]).applyQuaternion(forearmQ));
        aim.sub(at.sub(goal));
      }
      shoulder.quaternion.copy(chestQ).invert().multiply(limb);
    }
    this.root.scale.copy(scale);
    this.root.updateMatrixWorld(true);
    return { legs, thighs, twist };
  }
}

// ---------------------------------------------------------------- materials

const shopperAO = { value: 0 };
/**
 * Soft creases of worn cotton, 25 cm square and tileable: elongated ridges, mostly across the cloth.
 * Folds are 2-6 cm, so the mipmapped normals stay steady at every distance.
 */
function creaseTexture() {
  const n = 128, height = new Float32Array(n * n);
  let seed = 11;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 52; k++) {
    const cx = random() * n, cy = random() * n, a = (random() - .5) * 1.5, length = 9 + random() * 20, width = 1.8 + random() * 2.4;
    const amp = (random() < .5 ? -1 : 1) * (.5 + random()), c = Math.cos(a), s = Math.sin(a), reach = Math.ceil(length * 2.2);
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const u = dx * c + dy * s, v = dy * c - dx * s;
      const x = ((Math.floor(cx) + dx) % n + n) % n, y = ((Math.floor(cy) + dy) % n + n) % n;
      height[y * n + x] += amp * Math.exp(-((u / length) ** 2) - ((v / width) ** 2));
    }
  }
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx = (height[y * n + (x + 1) % n] - height[y * n + (x + n - 1) % n]) * .3;
    const sy = (height[((y + 1) % n) * n + x] - height[((y + n - 1) % n) * n + x]) * .3, l = Math.hypot(sx, sy, 1), i = (y * n + x) * 4;
    data[i] = (-sx / l * .5 + .5) * 255; data[i + 1] = (-sy / l * .5 + .5) * 255; data[i + 2] = (1 / l * .5 + .5) * 255; data[i + 3] = 255;
  }
  const texture = new T.DataTexture(data, n, n);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
/**
 * Clothing and skin in one physically based material: each vertex picks one of its instance's four packed colours
 * and the surface that goes with it (matte cotton with a soft sheen, skin, leather, rubber, reflective tape).
 * Skinned meshes fetch their joints from a float texture, one row per figure. The ambient-occlusion pass renders
 * these meshes with their own material, which then writes view normals as three's normal material would.
 */
let creases: T.Texture | undefined;
/**
 * The clothing-and-skin material. With `bones` it skins its vertices from that texture: Bone.count × 4 texels per row,
 * one row per figure (the instance's shopperExtra.x), each joint's world matrix × bindInverse, column-major.
 * Without it, instances are placed by their instance matrices (footwear).
 */
export function shopperMaterial(bones?: T.Texture) {
  const material = new T.MeshPhysicalMaterial({ side: T.DoubleSide, roughness: .88, specularIntensity: .45,
    sheen: 1, sheenColor: "#ffffff", sheenRoughness: .7, normalMap: creases ??= creaseTexture(), normalScale: new T.Vector2(.45, .45) });
  if (bones) {
    material.defines = { SHOPPER_SKIN: "" };
    material.allowOverride = false;
  }
  material.onBeforeCompile = shader => {
    shader.uniforms.shopperAO = shopperAO;
    if (bones) shader.uniforms.shopperBones = { value: bones };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float slot;
        attribute vec4 shopperPalette, shopperExtra;
        varying vec3 vTint, vSurface;
        varying vec2 vCloth;
        flat varying vec4 vPattern;
        vec3 shopperColour(float packed) {
          vec3 c = floor(packed / vec3(65536.0, 256.0, 1.0));
          c.yz -= c.xy * 256.0;
          c /= 255.0;
          return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c));
        }
        #ifdef SHOPPER_SKIN
          attribute vec4 skinIndex, skinWeight, shopperLegs;
          attribute vec3 drape;
          uniform highp sampler2D shopperBones;
          // Forward swing of loose cloth at one level: the front panel goes with the leg further forward, the back panel
          // with the leg further back, each side with its own leg. Free ends are only pushed away, never drawn in.
          float shopperSwing(vec2 legs, float m, float c, bool free) {
            float side = mix(legs.x, legs.y, m), right = legs.x * mix(1.0, .55, m), left = legs.y * mix(.55, 1.0, m);
            float ahead = max(right, left), behind = min(right, left);
            if (free) { ahead = max(ahead, 0.0); behind = min(behind, 0.0); side = c >= 0.0 ? max(side, 0.0) : min(side, 0.0); }
            float a = c >= 0.0 ? mix(side, max(ahead, side), c) : mix(side, min(behind, side), -c);
            // Cloth over the belly or the seat never swings into the body; it tucks under only when both thighs carry it (sitting).
            float held = c >= 0.0 ? max(a, min(0.0, max(legs.x, legs.y))) : min(a, max(0.0, min(legs.x, legs.y)));
            return mix(a, held, smoothstep(0.0, .4, abs(c)));
          }
          mat4 shopperBone(float bone) {
            ivec2 at = ivec2(int(bone) * 4, int(shopperExtra.x));
            return mat4(texelFetch(shopperBones, at, 0), texelFetch(shopperBones, at + ivec2(1, 0), 0),
              texelFetch(shopperBones, at + ivec2(2, 0), 0), texelFetch(shopperBones, at + ivec2(3, 0), 0));
          }
        #endif`)
      .replace("#include <skinbase_vertex>", `#include <skinbase_vertex>
        #ifdef SHOPPER_SKIN
          // Cloth below the hip line hangs along each leg: down the thigh, then the shin, offset by its depth in front or behind.
          vec3 shopperRest = position;
          float shopperTilt = 0.0;
          float shopperDepth = drape.x - position.y;
          // The swing grows below the hip line exactly as the thighs' own skin weights do.
          if (drape.x > 0.0 && shopperDepth > -.05) {
            float m = smoothstep(-.1, .1, position.x), c = position.z / max(length(position.xz), 1e-4), ramp = smoothstep(-.05, .12, shopperDepth);
            bool free = drape.z < 0.0;
            float thigh = shopperSwing(shopperLegs.xy, m, c, free) * ramp * abs(drape.z), shin = shopperSwing(shopperLegs.zw, m, c, free) * ramp * abs(drape.z);
            vec2 line = min(shopperDepth, drape.y) * vec2(-cos(thigh), sin(thigh)) + max(0.0, shopperDepth - drape.y) * vec2(-cos(shin), sin(shin));
            shopperTilt = mix(thigh, shin, smoothstep(drape.y - .06, drape.y + .06, shopperDepth));
            shopperRest.yz = vec2(drape.x, 0.0) + line + position.z * vec2(sin(shopperTilt), cos(shopperTilt));
          }
          mat4 shopperSkin = skinWeight.x * shopperBone(skinIndex.x) + skinWeight.y * shopperBone(skinIndex.y);
          if (skinWeight.z > 0.0) shopperSkin += skinWeight.z * shopperBone(skinIndex.z);
          if (skinWeight.w > 0.0) shopperSkin += skinWeight.w * shopperBone(skinIndex.w);
        #endif`)
      .replace("#include <skinnormal_vertex>", `#include <skinnormal_vertex>
        #ifdef SHOPPER_SKIN
          objectNormal.yz = vec2(objectNormal.y * cos(shopperTilt) + objectNormal.z * sin(shopperTilt), objectNormal.z * cos(shopperTilt) - objectNormal.y * sin(shopperTilt));
          objectNormal = (shopperSkin * vec4(objectNormal, 0.0)).xyz;
        #endif`)
      .replace("#include <skinning_vertex>", `#include <skinning_vertex>
        #ifdef SHOPPER_SKIN
          transformed = (shopperSkin * vec4(shopperRest, 1.0)).xyz;
        #endif`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        {
          int s = int(slot + .5);
          vTint = shopperColour(s == 1 || s == 5 ? shopperPalette.y : s == 2 || s == 8 ? shopperPalette.z : s == 3 ? shopperPalette.w : shopperPalette.x);
          if (s == 6) vTint = vec3(.6, .62, .58);
          if (s == 7) vTint = vec3(.022, .019, .017);
          // x: skin, y: roughness, z: sheen
          vSurface = s == 3 ? vec3(1.0, .5, 0.0) : s == 4 ? vec3(0.0, .4, .05) : s == 5 ? vec3(0.0, .78, 0.0)
            : s == 6 ? vec3(0.0, .42, 0.0) : s == 7 ? vec3(0.0, .38, 0.0) : s == 8 ? vec3(0.0, .55, .1) : vec3(0.0, .88, .45);
          vPattern = vec4(s == 0 ? shopperExtra.y : 0.0, shopperColour(shopperPalette.z));
          vCloth = uv;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vTint, vSurface;
        varying vec2 vCloth;
        flat varying vec4 vPattern;
        uniform float shopperAO;
        // Box-filtered stripes: the share of a pixel's footprint covered by threads of the given width.
        vec2 shopperRamp(vec2 x, float width) { return floor(x) * width + clamp(fract(x) - 1.0 + width, 0.0, width); }
        vec2 shopperCover(vec2 p, float width) {
          vec2 w = fwidth(p) + 1e-4;
          return (shopperRamp(p + .5 * w, width) - shopperRamp(p - .5 * w, width)) / w;
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb *= vTint;
        if (vPattern.x > .5) {
          // 1: shirting check, 2: pin stripe, 3: a small printed booti.
          float kind = vPattern.x;
          // The print sits on a diagonal lattice, so alternate rows of motifs are staggered.
          vec2 at = kind < 2.5 ? vCloth * (kind < 1.5 ? 31.0 : 64.0) : vec2(vCloth.x + vCloth.y, vCloth.x - vCloth.y) * 21.0;
          vec2 cover = shopperCover(at, kind < 2.5 ? .16 : .22);
          float m = kind < 1.5 ? cover.x + cover.y - cover.x * cover.y : kind < 2.5 ? cover.x : cover.x * cover.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, vPattern.yzw, m * (kind < 2.5 ? .75 : .9));
        }
        // The inside of a sleeve, hem or drape is in its own shade.
        if (!gl_FrontFacing) diffuseColor.rgb *= .55;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = vSurface.y;`)
      // Creases belong to the cloth: skin, leather and tape stay smooth.
      .replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * (1.0 - vSurface.x) * step(.8, vSurface.y);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        #ifdef SHOPPER_SKIN
          if (shopperAO > .5) { gl_FragColor = vec4(normal * .5 + .5, 1.0); return; }
        #endif`)
      .replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
        #ifdef USE_SHEEN
          // Woven cotton catches a pale sheen at grazing angles; skin a warm one, from light scattered under it.
          material.sheenColor = mix(vec3(vSurface.z) * (.35 + .65 * vTint), vec3(.36, .2, .15), vSurface.x);
          material.sheenRoughness = mix(.72, .55, vSurface.x);
        #endif`);
  };
  material.customProgramCacheKey = () => "shopper" + (bones ? "-skinned" : "");
  return material;
}

/** Hair: fibres reflect a highlight stretched across them, a band round the head, and a soft sheen. */
const hairLook = (vertexColors = false) => new T.MeshPhysicalMaterial({ vertexColors, roughness: .42, specularIntensity: .6, anisotropy: .75,
  sheen: .6, sheenRoughness: .35, sheenColor: new T.Color("#5e4c40") });

/**
 * One instanced draw of an outfit or overlay for `count` figures. Per instance, fill shopperPalette with four packed
 * colours (upper, lower, accent, skin), shopperExtra with (bone row, pattern 0-3, 0, 0) and shopperLegs with the forward
 * swing of each thigh and shin against the pelvis (radians: right thigh, left thigh, right shin, left shin).
 */
export function dressedMesh(kind: Outfit, material: T.Material, count: number) {
  const geo = outfitGeometry(kind);
  for (const name of ["shopperPalette", "shopperExtra", "shopperLegs"])
    geo.setAttribute(name, new T.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(T.DynamicDrawUsage));
  const mesh = new T.InstancedMesh(geo, material, count);
  mesh.name = "Shopper " + kind;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  // Ambient occlusion draws these with their own material, switched to write view normals.
  mesh.onBeforeRender = (_renderer, renderScene) => { shopperAO.value = renderScene.overrideMaterial ? 1 : 0; };
  return mesh;
}

// ---------------------------------------------------------------- batches

export function makeShopperBatch(scene: T.Group, count: number, seedOffset: number, faceMaterial:T.Material, dinerStart = count, workerStart = dinerStart, cashierStart = workerStart) {
  const people = Array.from({ length: count }, (_, i) => new Shopper(i + seedOffset, i, i >= dinerStart ? i - dinerStart : -1, i >= workerStart && i < dinerStart, i >= cashierStart && i < workerStart));

  // One float texture row of joint matrices per figure, shared by every skinned outfit on this level.
  const boneData = new Float32Array(Math.max(1, count) * Bone.count * 16);
  const bones = new T.DataTexture(boneData, Bone.count * 4, Math.max(1, count), T.RGBAFormat, T.FloatType);
  bones.needsUpdate = true;
  const clothing = shopperMaterial(bones), footwear = shopperMaterial();
  // Skin keeps a soft specular and a warm grazing sheen, as light scattering under the surface does.
  const skin = new T.MeshPhysicalMaterial({ roughness: .5, specularIntensity: .45,
    sheen: .35, sheenRoughness: .55, sheenColor: new T.Color("#ff9c7c") });
  const hairMaterial = hairLook();
  const plain = new T.MeshStandardMaterial({ roughness: .78 });
  const shadows = new T.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const materialFor = (form: Rigid) => form === "shadow" ? shadows : form === "face" ? faceMaterial : form === "head" ? skin
    : form === "shoes" || form === "sandals" ? footwear : form === "crop" || form === "bun" || form === "plait" || form === "curls" ? hairMaterial : plain;

  // Skinned outfits and overlays: every figure wearing one shares its draw.
  const dressed = [...new Set(people.flatMap(p => p.overlay ? [p.outfit, p.overlay] : [p.outfit]))].map(kind => {
    const wearers = people.filter(p => p.outfit === kind || p.overlay === kind), overlay = wearers[0].overlay === kind;
    const mesh = dressedMesh(kind, clothing, wearers.length), attribute = (name: string) => mesh.geometry.getAttribute(name) as T.InstancedBufferAttribute;
    const palette = attribute("shopperPalette"), extra = attribute("shopperExtra"), legs = attribute("shopperLegs");
    scene.add(mesh);
    return { mesh, wearers, overlay, palette, extra, legs, active: [] as Shopper[] };
  });

  const grouped = new Map<Rigid, Part[]>();
  for (const person of people) for (const part of person.parts) {
    const pile = grouped.get(part.form) ?? [];
    pile.push(part);
    grouped.set(part.form, pile);
  }
  const tones = new Map<string, T.Color>();
  const batches = Array.from(grouped, ([form, parts]) => {
    const geo = rigidGeometry(form);
    const portraits = form === "face"
      ? new T.InstancedBufferAttribute(new Float32Array(parts.length), 1).setUsage(T.DynamicDrawUsage) : null;
    if (portraits) geo.setAttribute("portraitCell", portraits);
    const palette = form === "shoes" || form === "sandals"
      ? new T.InstancedBufferAttribute(new Float32Array(parts.length * 4), 4).setUsage(T.DynamicDrawUsage) : null;
    if (palette) {
      geo.setAttribute("shopperPalette", palette);
      geo.setAttribute("shopperExtra", new T.InstancedBufferAttribute(new Float32Array(parts.length * 4), 4));
    }
    const mesh = new T.InstancedMesh(geo, materialFor(form), parts.length);
    mesh.name = "Shopper " + form;
    mesh.frustumCulled = false;
    mesh.receiveShadow = form !== "shadow";
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const tinted = form !== "shadow" && form !== "face" && !palette;
    if (tinted) for (const part of parts) {
      if (!tones.has(part.color)) tones.set(part.color, new T.Color(part.color));
    }
    scene.add(mesh);
    return { mesh, form, parts, portraits, palette, tinted, active: [] as Part[] };
  });
  const matrix = new T.Matrix4();
  // Sun shadows: each figure's simplified silhouette flattened onto its own floor along the sun direction.
  const casters = people.flatMap(person => person.parts.filter(part => part.form === "silhouette"));
  const shade = sunShadowMaterial();
  const sunShadows = new T.InstancedMesh(rigidGeometry("silhouette"), shade, casters.length);
  sunShadows.name = "Shopper sun shadows";
  sunShadows.frustumCulled = false;
  sunShadows.receiveShadow = true;
  sunShadows.instanceMatrix.setUsage(T.DynamicDrawUsage);
  sunShadows.userData.night = (on: boolean) => { shade.opacity = on ? .1 : .55; };
  scene.add(sunShadows);
  const flatten = new T.Matrix4();
  function syncShadows() {
    let count = 0;
    for (const part of casters) {
      if (!part.actor.visible) continue;
      sunProjection(flatten, part.actor.root.position.y + .012);
      sunShadows.setMatrixAt(count++, matrix.multiplyMatrices(part.joint.matrixWorld, part.local).premultiply(flatten));
    }
    sunShadows.count = count;
    sunShadows.instanceMatrix.needsUpdate = true;
  }
  // Pack each draw into the beginning of the instance buffers. Bodies that change detail or
  // disappear take no vertices in their previous draw. Colours and atlas cells follow the packed indices.
  function repack() {
    for (const {mesh, form, parts, active, portraits, palette, tinted} of batches) {
      active.length = 0;
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j], person = part.actor;
        const usesDetail = form === "shadow" || (form === "silhouette" ? !person.detailed : person.detailed);
        if (!person.visible || !usesDetail) continue;
        const index = active.length;
        active.push(part);
        if (tinted) mesh.setColorAt(index, tones.get(part.color)!);
        if (portraits) portraits.setX(index, person.portraitIndex);
        if (palette) palette.setXYZW(index, person.footPalette[0], person.footPalette[1], person.footPalette[2], person.footPalette[3]);
      }
      mesh.count = active.length;
      mesh.visible = mesh.count > 0;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (portraits) portraits.needsUpdate = true;
      if (palette) palette.needsUpdate = true;
    }
    for (const { mesh, wearers, overlay, palette, extra, active } of dressed) {
      active.length = 0;
      for (const person of wearers) {
        if (!person.visible || !person.detailed) continue;
        const i = active.push(person) - 1, colours = overlay ? person.overlayPalette : person.palette;
        palette.setXYZW(i, colours[0], colours[1], colours[2], colours[3]);
        extra.setXYZW(i, person.row, overlay ? 0 : person.pattern, 0, 0);
      }
      mesh.count = active.length;
      mesh.visible = mesh.count > 0;
      palette.needsUpdate = extra.needsUpdate = true;
    }
  }
  const boneMatrix = new T.Matrix4();
  function syncInstances() {
    for (const person of people) {
      if (!person.visible || !person.detailed) continue;
      const inverse = bindInverse(person.build);
      for (let b = 0; b < Bone.count; b++) boneMatrix.multiplyMatrices(person.bones[b].matrixWorld, inverse[b]).toArray(boneData, (person.row * Bone.count + b) * 16);
    }
    bones.needsUpdate = true;
    // Forward angles of each thigh and shin against the pelvis, for the cloth that hangs over them.
    for (const { legs, active } of dressed) {
      for (let i = 0; i < active.length; i++) {
        const right = active[i].legs[0], left = active[i].legs[1];
        legs.setXYZW(i, -right.hip.rotation.x, -left.hip.rotation.x,
          -right.hip.rotation.x - right.knee.rotation.x, -left.hip.rotation.x - left.knee.rotation.x);
      }
      legs.needsUpdate = true;
    }
    for (const { mesh, active } of batches) {
      if (!mesh.count) continue;
      for (let i = 0; i < active.length; i++) {
        const part = active[i];
        mesh.setMatrixAt(i, matrix.multiplyMatrices(part.joint.matrixWorld, part.local));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    syncShadows();
  }
  repack();
  return {
    update(poses: PersonPose[]) {
      for (let i = 0; i < people.length; i++) people[i].pose(poses[i]);
      syncInstances();
    },
    setCameraPosition(camera:T.Vector3) {
      let changed=false;
      for(const person of people){
        const {x,y,z}=person.root.position;
        const sameLevel=camera.y>=y-.16 && camera.y<=y+1.95*person.root.scale.y;
        // Hysteresis keeps a person from flashing at the edge of the personal-space radius.
        const radius=person.visible?.74:.88;
        const horizontal = (camera.x-x)**2 + (camera.z-z)**2;
        const visible = !sameLevel || horizontal > radius**2;
        // Separate enter/exit distances prevent detail from flickering at walking speed.
        const detailRadius = person.detailed ? 39 : 34;
        const detailed = horizontal + (camera.y - y - .90 * person.root.scale.y)**2 < detailRadius**2;
        if(visible!==person.visible){person.visible=visible;changed=true;}
        if(detailed!==person.detailed){person.detailed=detailed;changed=true;}
      }
      if(changed){repack();syncInstances();}
    },
  };
}

// ---------------------------------------------------------------- vehicle occupants

/** Main outfits an occupant can be given ("jacket" is read as "riding"). Men: shirt, formal, kurta, crew, riding; women: salwar, saree, kurti. */
export type OccupantOutfit = "shirt" | "formal" | "kurta" | "crew" | "riding" | "jacket" | "salwar" | "saree" | "kurti";
/** Where a seated figure goes, in metres in the vehicle's frame: +z forward, +y up, the figure's left +x and right -x. */
export type OccupantSpec = {
  /** Appearance: the face, build, clothes, colours and hair of pedestrian seed `seed`. */
  seed: number;
  /** Midpoint of the hip joints, about 0.075-0.09 m above the seat surface. */
  pelvis: V3;
  /** Torso pitch forward in radians, shared by pelvis and spine: scooter ~.06, roadster ~.25, car seat ~-.2. */
  lean: number;
  /** Pelvis yaw in radians, + turns the figure to its left (side-saddle on the left ~1.4). */
  yaw?: number;
  /** Head yaw against the torso in radians, + to the figure's left. */
  look?: number;
  /** Where each hand closes: the middle of a grip or the rim under the fingers (for a flat rest give a point ~3 cm above it). */
  hands: { left: V3; right: V3 };
  /** The way each palm faces. Default down and forward, onto a handlebar grip, a shoulder or a lap; a wheel rim held at 9 and 3
   * runs upright, so face the palms in towards the hub and forward: right [.6, 0, .8], left [-.6, 0, .8]. */
  palms?: { left: V3; right: V3 };
  /** Ankle joints: about 0.065 m above a footrest top or floor under the arch, less for a heel resting on a car floor. */
  feet: { left: V3; right: V3 };
  /** Omitted: bare head with hair. Full-face hides head and hair behind a smoked visor; open-face shows the face. */
  helmet?: { style: Helmet; color: string };
  /** Replaces the seed's main outfit when it suits the figure's gender (otherwise ignored); the seed still picks colours. */
  outfit?: OccupantOutfit;
};

let occupantLook: { clothing: T.Material; hair: T.Material; helmet: T.Material; visor: T.Material } | undefined;
const occupantMaterials = () => occupantLook ??= {
  clothing: shopperMaterial(),
  hair: hairLook(true),
  // A glossy painted shell under a clear coat; the smoked visor and rubber trim share it.
  helmet: new T.MeshPhysicalMaterial({ vertexColors: true, roughness: .36, clearcoat: 1, clearcoatRoughness: .1 }),
  visor: new T.MeshPhysicalMaterial({ color: "#3d4b52", transparent: true, opacity: .2, roughness: .05, depthWrite: false, side: T.DoubleSide }),
};

/** shopperSwing from the skinned cloth shader: the forward swing of loose cloth at one level, for each side of the body. */
function swing(right: number, left: number, m: number, c: number, free: boolean) {
  let side = right + (left - right) * m, ahead = Math.max(right * (1 - .45 * m), left * (.55 + .45 * m)), behind = Math.min(right * (1 - .45 * m), left * (.55 + .45 * m));
  if (free) { ahead = Math.max(ahead, 0); behind = Math.min(behind, 0); side = c >= 0 ? Math.max(side, 0) : Math.min(side, 0); }
  const a = c >= 0 ? side + (Math.max(ahead, side) - side) * c : side + (Math.min(behind, side) - side) * -c;
  const held = c >= 0 ? Math.max(a, Math.min(0, Math.max(right, left))) : Math.min(a, Math.max(0, Math.min(right, left)));
  return a + (held - a) * T.MathUtils.smoothstep(Math.abs(c), 0, .4);
}

/**
 * One garment skinned once on the CPU, as the pedestrians' shader skins it every frame, with the hands closed. Seated, loose
 * cloth in front lies fully along the thighs and hangs from the knees; the back hangs over the seat, and it and the free ends
 * (dupatta, pallu) stop on the seat rather than passing through it. Each forearm turns by its pronation, spread from elbow to
 * wrist so the elbow keeps its shape.
 */
function bakeOutfit(person: Shopper, kind: Outfit, legs: number[], thighs: T.Vector3[], twist: number[]) {
  const g = outfitGeometry(kind, 1), b = person.build, j = bindJoints(b), inverse = bindInverse(b), ss = T.MathUtils.smoothstep;
  const bones = person.bones.map((bone, i) => new T.Matrix4().multiplyMatrices(bone.matrixWorld, inverse[i]));
  const turns = bones.map(m => new T.Matrix3().setFromMatrix4(m));
  const P = g.getAttribute("position"), N = g.getAttribute("normal"), D = g.getAttribute("drape"), I = g.getAttribute("skinIndex"), W = g.getAttribute("skinWeight");
  const position = new Float32Array(P.count * 3), normal = new Float32Array(P.count * 3);
  const rest = new T.Vector3(), dir = new T.Vector3(), v = new T.Vector3(), n = new T.Vector3(), sum = new T.Vector3(), nsum = new T.Vector3();
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), y = P.getY(k), z = P.getZ(k), hip = D.getX(k), thighLength = D.getY(k), follow = D.getZ(k), depth = hip - y;
    rest.set(x, y, z);
    dir.set(N.getX(k), N.getY(k), N.getZ(k));
    if (hip > 0 && depth > -.05) {
      const c = z / Math.max(Math.hypot(x, z), 1e-4), free = follow < 0, m = ss(x, -.1, .1), strength = ss(depth, -.05, .12) * (free ? -follow : 1);
      const hang = strength * (free ? 1 : ss(c, -.2, .1)), thigh = swing(legs[0], legs[1], m, c, free) * hang, shin = swing(legs[2], legs[3], m, c, free) * hang;
      const along = Math.min(depth, thighLength), below = Math.max(0, depth - thighLength);
      const tilt = thigh + (shin - thigh) * ss(depth, thighLength - .06, thighLength + .06), cos = Math.cos(tilt), sin = Math.sin(tilt);
      rest.y = hip - along * Math.cos(thigh) - below * Math.cos(shin) + z * sin;
      rest.z = along * Math.sin(thigh) + below * Math.sin(shin) + z * cos;
      if (free || c < 0) rest.y = Math.max(rest.y, hip - .085);
      // A flexed thigh fills the space in front of the lower belly: cloth there rides up over it, clear of the trouser leg.
      if (!free) for (let i = 0; i < 2; i++) {
        const u = thighs[i], s = (rest.x - (i * 2 - 1) * b.hip) * u.x + (rest.y - hip) * u.y + rest.z * u.z;
        if (s < -.03 || s > thighLength) continue;
        v.set(rest.x - (i * 2 - 1) * b.hip - s * u.x, rest.y - hip - s * u.y, rest.z - s * u.z);
        const r = v.length(), clear = (.1 - .022 * Math.max(0, s) / thighLength) * b.leg;
        if (r < clear && r > 1e-4) rest.addScaledVector(v, clear / r - 1);
      }
      dir.set(dir.x, dir.y * cos + dir.z * sin, dir.z * cos - dir.y * sin);
    }
    sum.set(0, 0, 0);
    nsum.set(0, 0, 0);
    for (let t = 0; t < 4; t++) {
      const w = W.getComponent(k, t), bone = I.getComponent(k, t), arm = bone === Bone.elbow(0) ? 0 : bone === Bone.elbow(1) ? 1 : -1;
      if (!(w > 0)) continue;
      v.copy(rest);
      n.copy(dir);
      if (arm >= 0) {
        const e = j[Bone.elbow(arm)], turn = twist[arm] * ss(e.y - y, .03, b.forearm);
        v.sub(e).applyAxisAngle(yAxis, turn).add(e);
        n.applyAxisAngle(yAxis, turn);
      }
      sum.addScaledVector(v.applyMatrix4(bones[bone]), w);
      nsum.addScaledVector(n.applyMatrix3(turns[bone]), w);
    }
    sum.toArray(position, k * 3);
    nsum.normalize().toArray(normal, k * 3);
  }
  return new T.BufferGeometry().setIndex(g.getIndex()).setAttribute("position", new T.BufferAttribute(position, 3))
    .setAttribute("normal", new T.BufferAttribute(normal, 3)).setAttribute("uv", g.getAttribute("uv")).setAttribute("slot", g.getAttribute("slot"));
}

/** Per-vertex copies of one value for every vertex of `g`. */
const each = (g: T.BufferGeometry, values: number[]) => {
  const n = g.getAttribute("position").count, size = values.length, a = new Float32Array(n * size);
  for (let i = 0; i < n; i++) a.set(values, i * size);
  return new T.BufferAttribute(a, size);
};
/** A piece of an occupant's clothing mesh: its packed colours (upper, lower, accent, skin) and pattern on every vertex. */
function clothed(g: T.BufferGeometry, palette: number[], pattern = 0, slot?: number) {
  return new T.BufferGeometry().setIndex(g.getIndex()).setAttribute("position", g.getAttribute("position")).setAttribute("normal", g.getAttribute("normal"))
    .setAttribute("uv", g.getAttribute("uv")).setAttribute("slot", slot === undefined ? g.getAttribute("slot") : each(g, [slot]))
    .setAttribute("shopperPalette", each(g, palette)).setAttribute("shopperExtra", each(g, [0, pattern, 0, 0]));
}

/**
 * A seated driver, rider or passenger: the same people as the pedestrians (seeded face, build, clothes, hair), posed once and
 * returned as a static group for a vehicle group to carry. Usage:
 *
 *   const rider = occupantFigure({ seed: 7, pelvis: [0, .85, -.2], lean: .06,
 *     hands: { left: [.29, 1, .312], right: [-.29, 1, .312] }, feet: { left: [.14, .39, .25], right: [-.14, .39, .25] },
 *     helmet: { style: "open-face", color: "#f2dbc0" } });
 *   vehicle.add(rider);          // before castSunShadow(vehicle), which then gives the figure a sun shadow
 *
 * Coordinates are the vehicle's (see OccupantSpec). Thigh/shin and upper arm/forearm reach their targets by IK, knees bending
 * forward and out, elbows down and out; out-of-reach targets leave the limb straight towards them. Shoulders sit ~.47 m above
 * the pelvis point and ±.17 m out (women .44, ±.15); arm reach to the hand point ~.63 m (women .58), hip to ankle ~.83 m
 * (.77), all times the seed's height scale .94-1.03: keep hands within ~85% of reach for relaxed elbows. Feet point along the
 * thighs, flat unless the shin slopes forward (pedals). Palms face `palms` (default down and forward, as on handlebar grips).
 * Seeds: odd face cells are men, cell = (seed * 5 + floor(seed / 8)) % 8, so men 1, 3, 5, 7, 8, 10, 12, 14 (5 and 12 older),
 * women 0, 2, 4, 6, 9, 11, 13, 15 (2 and 13 older).
 *
 * Opaque meshes, not instanced, receiveShadow on, shared materials, no per-frame work: "… clothes" (outfit, overlay, head,
 * hands, footwear in the pedestrians' cloth material, per-vertex colours), "… hair", "Helmet" (shell, trim, smoked visor),
 * plus the transparent "… face" (the shared face atlas: it appears once the atlas has loaded) and the open-face "Helmet visor".
 * 1.5-12 k triangles, 2-5 draws.
 */
export function occupantFigure(spec: OccupantSpec): T.Group {
  const female = faceCell(spec.seed) % 2 === 0, kind = spec.outfit === "jacket" ? "riding" : spec.outfit;
  const person = new Shopper(spec.seed, 0, -1, false, false, kind && ["salwar", "saree", "kurti"].includes(kind) === female ? kind : undefined);
  const helmet = spec.helmet, bare = !helmet, showFace = helmet?.style !== "full-face";
  // A helmet goes over a dupatta laid on the shoulders rather than one drawn over the head.
  if (helmet && person.overlay === "veil") person.overlay = "dupatta";
  const { legs, thighs, twist } = person.seat(spec), look = occupantMaterials(), at = new T.Matrix4();
  const clothes = [clothed(bakeOutfit(person, person.outfit, legs, thighs, twist), person.palette, person.pattern)];
  if (person.overlay) clothes.push(clothed(bakeOutfit(person, person.overlay, legs, thighs, twist), person.overlayPalette));
  const hair: T.BufferGeometry[] = [], faces: T.BufferGeometry[] = [];
  for (const part of person.parts) {
    const form = part.form, piece = () => rigidGeometry(form).applyMatrix4(at.multiplyMatrices(part.joint.matrixWorld, part.local));
    if (form === "shoes" || form === "sandals") clothes.push(clothed(piece(), person.footPalette));
    else if (form === "head" && showFace) clothes.push(clothed(piece(), person.palette, 0, Slot.skin));
    else if (form === "face" && showFace) {
      const g = portraitGeometry(bare ? .5 : .34).applyMatrix4(at.multiplyMatrices(part.joint.matrixWorld, part.local));
      faces.push(g.setAttribute("portraitCell", each(g, [person.portraitIndex])));
    }
    else if (form === "oval" && bare) clothes.push(clothed(piece(), [pack(part.color), pack(part.color), pack(part.color), person.palette[3]], 0, Slot.leather));
    else if ((form === "crop" || form === "bun" || form === "plait" || form === "curls") && bare) {
      const g = piece();
      hair.push(g.setAttribute("color", each(g, new T.Color(part.color).toArray())));
    }
  }
  const group = new T.Group();
  group.name = "Seated figure";
  const add = (pieces: T.BufferGeometry[], material: T.Material, name: string) => {
    if (!pieces.length) return;
    const mesh = new T.Mesh(mergeGeometries(pieces), material);
    mesh.name = name;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(clothes, look.clothing, "Seated figure clothes");
  add(hair, look.hair, "Seated figure hair");
  const gear = helmet && helmetGeometry(helmet.style, helmet.color);
  if (gear) add([gear.shell.applyMatrix4(person.head.matrixWorld)], look.helmet, "Helmet");
  // The face decal draws before the clear visor in front of it: both are transparent and sort by creation at equal depth.
  add(faces, shopperPortraits().material, "Seated figure face");
  if (gear?.visor) add([gear.visor.applyMatrix4(person.head.matrixWorld)], look.visor, "Helmet visor");
  return group;
}
