import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { apronGeometry, clothTexture, garmentGeometry, hairGeometry, headGeometry, portraitGeometry, type Garment } from "./shopperAppearance";
import { sunProjection, sunShadowMaterial } from "./realism";

export type PersonPose = {
  x: number; z: number; floorY: number; heading: number;
  stride: number; walking: number; browsing: number; time: number;
  tillHand?: number;
  carrying?: number;
  crouch?: number;
};

type Form = "apron" | "workwear" | "oval" | "linen" | "shirt" | "tunic" | "thigh" | "shin" | "sleeve" | "forearm" | "hand" | "foot" | "head" | "face" | "hair" | "hem" | "collar" | "bag" | "ring" | "shadow" | "cup" | "silhouette";
type Part = { actor: Shopper; joint: T.Object3D; form: Form; color: string; local: T.Matrix4 };

function profile(rings: [number, number][], sides = 12) {
  return new T.LatheGeometry(rings.map(([radius, height]) => new T.Vector2(radius, height)), sides);
}

function humanGeometry(form: Form) {
  switch (form) {
    case "workwear": case "linen": case "shirt": case "tunic": return garmentGeometry(false);
    case "apron": return apronGeometry();
    case "hem": return garmentGeometry(true);
    case "thigh": return profile([[0, -1.02],[.265,-1.02],[.35,-.97],[.35,-.91],[.33,-.83],[.405,-.72],[.40,-.67],[.432,-.56],[.47,-.38],[.49,-.23],[.48,-.14],[.44,-.06],[.37,.04],[.28,.08],[0,.08]],17);
    case "shin": return profile([[0,-1.04],[.36,-1.04],[.39,-1],[.35,-.93],[.37,-.84],[.303,-.79],[.306,-.70],[.376,-.49],[.419,-.35],[.413,-.25],[.365,-.15],[.36,-.08],[.394,.015],[.29,.09],[0,.105]],16);
    case "sleeve": return profile([[0,-1],[.46,-1],[.50,-.985],[.495,-.94],[.465,-.91],[.485,-.75],[.50,-.65],[.475,-.55],[.51,-.41],[.55,-.20],[.54,-.02],[.47,.095],[.33,.15],[0,.19]],15);
    case "forearm": return profile([[0,-1],[.26,-1],[.30,-.92],[.28,-.83],[.32,-.68],[.415,-.48],[.45,-.34],[.46,-.19],[.38,-.07],[.36,.02],[.26,.07],[0,.09]]);
    case "hand": {
      const palm = profile([[0,-.092],[.64,-.090],[.91,-.080],[.99,-.047],[.86,-.019],[.66,.010],[0,.014]]);
      palm.scale(.023, 1, .041);
      const fingers = [.057, .073, .078, .069].map((length, i) => {
        const digit = profile([[0,-1],[.68,-.98],[.82,-.90],[.84,-.65],[.93,-.50],[.87,-.40],[1,-.17],[.97,0],[0,.13]], 7);
        digit.scale(.010, length, .0107);
        digit.rotateX(.09 - .04 * i);
        digit.translate(0, -.080 + (i === 0 ? .007 : 0), -.028 + i * .0185);
        return digit;
      });
      const pieces = [palm, ...fingers];
      const hand = mergeGeometries(pieces);
      pieces.forEach(piece => piece.dispose());
      return hand;
    }
    case "foot": {
      const sections = [[-.081,.018,.032],[-.069,.049,.071],[-.035,.058,.097],
        [.022,.060,.103],[.073,.064,.084],[.126,.061,.058],[.164,.049,.047],[.182,.021,.031]];
      const pos:number[]=[],index:number[]=[];
      sections.forEach(([z,w,height],i)=>{
        for(let j=0;j<10;j++){
          const a=j*Math.PI/5;
          pos.push(w*Math.sin(a),-.052+height*Math.pow(.5+.5*Math.cos(a),1.22),z);
          if(i+1<sections.length){
            const k=i*10+j, next=i*10+(j+1)%10;
            index.push(k,next+10,next,k,k+10,next+10);
          }
        }
      });
      for (const end of [0, sections.length - 1]) {
        const [z, , h] = sections[end];
        const centre = pos.length / 3;
        pos.push(0, -.052 + h / 2, z);
        for (let j = 0; j < 10; j++) {
          const near = end * 10 + j, next = end * 10 + (j + 1) % 10;
          if (end === 0) index.push(centre, near, next);
          else index.push(centre, next, near);
        }
      }
      const g=new T.BufferGeometry();g.setAttribute("position",new T.Float32BufferAttribute(pos,3));
      g.setIndex(index);g.computeVertexNormals();return g;
    }
    case "head": return headGeometry();
    case "face": return portraitGeometry();
    case "hair": return hairGeometry();
    case "collar": {
      const g = new T.BufferGeometry(), vertices:number[]=[];
      for(const side of [-1,1]) {
        const points=[[.023,.471,.060],[.065,.49,.040],[.113,.451,.073],[.060,.393,.116]];
        for(const i of [0,1,2,0,2,3])vertices.push(points[i][0]*side,points[i][1],points[i][2]);
      }
      g.setAttribute("position",new T.Float32BufferAttribute(vertices,3)); g.computeVertexNormals(); return g;
    }
    case "oval": return new T.SphereGeometry(.5, 10, 7);
    case "bag": return new T.BoxGeometry(1, 1, 1);
    case "ring": return new T.TorusGeometry(.5, .055, 5, 12);
    case "cup": return profile([[0,0],[.032,0],[.036,.005],[.045,.070],[.045,.081],[.041,.081],[.039,.073],[.031,.013],[0,.013]],16);
    // A rounded six-sided solid. The colour and proportions of each joint define its distant silhouette.
    case "silhouette": return profile([[0,-.5],[.36,-.44],[.50,-.19],[.48,.29],[.33,.45],[0,.5]],6);
    case "shadow": return new T.PlaneGeometry(1, 1);
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

const clothes = ["#276872", "#bc7658", "#9a4958", "#d0bd95", "#777c9f", "#627958", "#d69a57", "#718ca0", "#b2a399", "#aa7891", "#315067", "#e3d3bd"];
const trousers = ["#444854", "#424e5b", "#635956", "#586856", "#765e51", "#39454b"];
// Cheek midtones from the eight portrait cells keep the wrists, ears and neck continuous with the face.
const skinTones = ["#ca957c", "#bc8871", "#c49075", "#c38b73", "#bb836e", "#bf8874", "#c9957d", "#c79279"];
const hairTones = ["#352a28", "#282929", "#463731", "#332e30", "#61534b"];

function joint(parent: T.Object3D, x: number, y: number, z: number) {
  const result = new T.Object3D();
  result.position.set(x, y, z);
  parent.add(result);
  return result;
}

const fullTurn = 2 * Math.PI;
const ankleTarget = new T.Vector3(), inversePelvis = new T.Quaternion();
const palmTarget = new T.Vector3(), inverseChest = new T.Quaternion();

/** Each joint drives a handful of shared instances. All figures on a level use one batch per shape. */
class Shopper {
  root = new T.Object3D();
  pelvis = joint(this.root, 0, .895, 0);
  chest = joint(this.pelvis, 0, .012, 0);
  head = joint(this.chest, 0, .528, 0);
  legs: { hip: T.Object3D; knee: T.Object3D; foot: T.Object3D }[] = [];
  arms: { shoulder: T.Object3D; elbow: T.Object3D }[] = [];
  bag?: T.Object3D;
  tableware?: T.Object3D;
  parts: Part[] = [];
  visible = true;
  detailed = true;
  portraitIndex: number;
  constructor(readonly seed: number, readonly dinerIndex: number, crew: boolean, cashier: boolean) {
    const shirt = crew ? "#324450" : cashier ? ["#d6cbb5","#c6ced0","#d9cfbe"][seed % 3] : clothes[(seed * 7 + 2) % clothes.length];
    const trousersColor = crew ? "#394650" : trousers[(seed * 5 + 1) % trousers.length];
    this.portraitIndex = (seed * 5 + Math.floor(seed / 8)) % 8;
    const skin = skinTones[this.portraitIndex];
    const hair = this.portraitIndex===2 || this.portraitIndex===5 ? "#68625b" : hairTones[(seed * 3) % hairTones.length];
    const shoes = crew ? "#473a30" : ["#37312c", "#ddd0b5", "#4a3a33", "#ebe6d9"][(seed * 3) % 4];
    const tunic = !crew && !cashier && seed % 3 === 0 && dinerIndex < 0, longHair = this.portraitIndex % 2 === 0;
    const shoppingBag = !crew && !cashier && dinerIndex < 0 && (seed % 4 === 0 || seed % 5 === 1);
    const scarf = clothes[(seed * 7 + 6) % clothes.length];
    const transform = new T.Object3D();
    const put = (j: T.Object3D, form: Form, color: string, x: number, y: number, z: number,
      sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
      transform.position.set(x, y, z);
      transform.scale.set(sx, sy, sz);
      transform.rotation.set(rx, ry, rz);
      transform.updateMatrix();
      this.parts.push({ actor: this, joint: j, form, color, local: transform.matrix.clone() });
    };
    const height = .91 + (seed % 7) * .026, breadth = .94 + ((seed * 7) % 9) * .016;
    this.root.scale.set(breadth, crew || cashier ? 1 : height, breadth);
    this.head.scale.setScalar(.87 + .016 * (seed % 3));
    put(this.root, "shadow", "#ffffff", 0, .009, .025, .72, 1.08, 1, -Math.PI / 2);
    const garment = crew ? "workwear" : tunic ? "tunic" : seed % 5===0 ? "linen" : "shirt";
    const shoulderWidth = (longHair ? .92 : 1.03) + .018 * ((seed % 5) - 2);
    put(this.chest, garment, crew ? "#ffffff" : shirt, 0, 0, 0, shoulderWidth, 1, 1);
    if (cashier) {
      const canvas = ["#365650","#514a45","#775743","#3e5264"][seed % 4];
      put(this.chest, "apron", canvas, 0, 0, .006, shoulderWidth, 1, 1);
      for (const side of [-1, 1]) {
        put(this.chest, "oval", canvas, side * .080, .428, .092, .024, .122, .029, -.61, 0, side * .15);
      }
      put(this.chest, "bag", "#d4c3a4", -.051, .327, .147, .057, .023, .006);
    }
    if (tunic) {
      put(this.chest, "hem", shirt, 0, -.015, 0, .98, 1, .97);
      put(this.chest, "oval", scarf, .104, .177, .112, .068, .49, .022, 0, 0, -.13);
      put(this.chest, "oval", scarf, .063, .386, .106, .068, .226, .028, 0, 0, -.65);
    } else {
      if(garment==="shirt")put(this.chest, "collar", shirt, 0, 0, 0, shoulderWidth,1,1);
      put(this.chest, "oval", trousersColor, 0, -.004, 0, .34, .11, .207);
    }
    put(this.chest, "oval", skin, 0, .499, -.003, .101, .134, .108);
    put(this.head, "head", skin, 0, 0, 0, 1, 1, 1);
    put(this.head, "face", "#ffffff", 0, 0, 0, 1, 1, 1);
    put(this.head, "hair", hair, 0, 0, 0, 1, 1, 1);
    // These pieces follow the same joints as the portrait rig, including its seated and carrying poses.
    put(this.chest, "silhouette", crew ? "#e19239" : shirt, 0,.20,0, .40,.55,.252);
    put(this.chest, "silhouette", tunic ? shirt : trousersColor, 0,-.048,0, .37,tunic ? .28 : .13,.231);
    put(this.chest, "silhouette", skin, 0,.486,0, .095,.126,.10);
    put(this.head, "silhouette", skin, 0,.123,.006, .211,.262,.224);
    put(this.head, "silhouette", hair, 0,.202,-.014, .212,.145,.221);
    if (longHair) {
      put(this.head, "silhouette", hair, 0,.096,-.076, .170,.257,.104);
      put(this.head, "oval", hair, 0, .095, -.071, .176, .254, .101, -.055);
      if(seed%3!==2)put(this.head, "oval", hair, 0, .084, -.125, .105, .115, .094);
      else put(this.head,"oval",hair,0,.017,-.108,.134,.207,.068,-.10);
    }
    for (const side of [-1, 1]) {
      put(this.head, "oval", skin, side*.094, .109, -.005, .030, .054, .029);
      put(this.head, "oval", skin, side*.104, .108, -.001, .010, .031, .016);
      if(longHair && seed%3===1)put(this.head,"oval","#bfab77",side*.099,.083,0,.010,.013,.010);
      const hip = joint(this.pelvis, side * .081, -.012, 0);
      const knee = joint(hip, 0, -.424, 0);
      const foot = joint(knee, 0, -.405, 0);
      this.legs.push({ hip, knee, foot });
      put(hip, "silhouette", trousersColor, 0,-.197,0, .177,.49,.185);
      put(knee, "silhouette", trousersColor, 0,-.194,-.007, .151,.436,.157);
      put(foot, "silhouette", shoes, 0,-.006,.047, .133,.106,.265);
      put(hip, "thigh", trousersColor, 0, 0, 0, .171, .426, .182);
      put(knee, "oval", trousersColor, 0, -.002, -.006, .132, .137, .145);
      put(knee, "shin", trousersColor, 0, .004, -.009, .163, .389, .161);
      put(foot, "foot", shoes, 0, 0, .012, 1, 1, 1);
      put(foot, "oval", "#776e61", 0, -.046, .061, .128, .019, .252);
      const shoulder = joint(this.chest, side * .166, .402, 0);
      const elbow = joint(shoulder, 0, -.266, 0);
      this.arms.push({ shoulder, elbow });
      if (!tunic) put(shoulder,"silhouette",skin,0,-.196,0,.100,.17,.109);
      put(shoulder,"silhouette",shirt,0,tunic ? -.120 : -.075,0,.137,tunic ? .298 : .223,.145);
      put(elbow,"silhouette",skin,0,-.144,.008,.107,.340,.104);
      put(shoulder, "sleeve", shirt, 0, .009, 0, .124, (tunic ? .268 : .166), .143);
      if (!tunic) put(shoulder, "forearm", skin, 0, -.142, 0, .119, .131, .124);
      put(elbow, "forearm", skin, 0, .006, .001, .103, .237, .114);
      put(elbow, "hand", skin, 0, -.230, .005, 1, .89, 1);
      put(elbow, "oval", skin, -side*.018, -.266, .032, .025, .058, .024, -.26,0,-side*.23);
      if (shoppingBag && side === -1) {
        this.bag = joint(elbow, 0, -.298, .005);
        put(this.bag, "silhouette", "#bb986d", -.035,-.169,0,.14,.24,.23);
        put(this.bag, "ring", "#ad8b63", -.018, -.022, 0, .100, .12, .18, 0, Math.PI / 2);
        put(this.bag, "bag", seed % 3 === 0 ? "#ab704e" : "#c2a87c", -.035, -.169, 0, .12, .23, .22, 0, -.07);
      }
      if (dinerIndex >= 0 && side === 1) {
        const grip = this.tableware = joint(elbow, 0, -.294, .016);
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
    }
  }

  private sit(p: PersonPose) {
    // Distinct periods and pauses let table companions listen, eat and look up in turn.
    const phase = T.MathUtils.euclideanModulo(p.time / (8.7 + this.seed % 5) + this.seed * .379, 1);
    const lift = T.MathUtils.smoothstep(phase, .18, .36) * (1 - T.MathUtils.smoothstep(phase, .49, .73));
    const conversation = Math.sin(p.time * .68 + this.seed) * (1 - lift);
    this.pelvis.position.set(0, .45 / this.root.scale.y + .054, 0);
    this.pelvis.rotation.set(0, 0, 0);
    this.chest.rotation.set(.073 + .025 * conversation, .061 * conversation, -.018 * conversation);
    this.head.rotation.set(.11 * lift + .032 * Math.sin(p.time * 1.12 + this.seed),
      .22 * conversation - .10 * lift, .023 * conversation);
    for (let i = 0; i < this.legs.length; i++) {
      const {hip, knee, foot} = this.legs[i];
      hip.rotation.set(-1.45 - i * .05, 0, (i * 2 - 1) * .07);
      knee.rotation.set(1.43 + i * .11, 0, 0);
      foot.rotation.set(-hip.rotation.x - knee.rotation.x, (i * 2 - 1) * .11, 0);
    }
    const resting = this.arms[0], eating = this.arms[1];
    resting.shoulder.rotation.set(-.26 - .08 * conversation, .03, -.09);
    resting.elbow.rotation.set(-1.17 - .08 * conversation, 0, 0);
    eating.shoulder.rotation.set(-.47 - .64 * lift, -.12 - .51 * lift, -.036);
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
      palmTarget.z /= this.root.scale.z;
      palmTarget.sub(this.pelvis.position).applyQuaternion(inversePelvis)
        .sub(this.chest.position).applyQuaternion(inverseChest).sub(shoulder.position);
      const reach = Math.hypot(palmTarget.x, palmTarget.z);
      const upper = .266, forearm = .301;
      const distance = T.MathUtils.clamp(Math.hypot(reach, palmTarget.y), .12, upper + forearm - .001);
      const shoulderBend = Math.acos(T.MathUtils.clamp((upper ** 2 + distance ** 2 - forearm ** 2) / (2 * upper * distance), -1, 1));
      shoulder.rotation.set(shoulderBend - Math.atan2(reach, -palmTarget.y),
        Math.atan2(palmTarget.x, palmTarget.z), 0, "YXZ");
      elbow.rotation.x = -Math.acos(T.MathUtils.clamp((distance ** 2 - upper ** 2 - forearm ** 2) / (2 * upper * forearm), -1, 1));
    }
  }

  pose(p: PersonPose) {
    const wave = p.walking, browse = p.browsing;
    const idle = Math.sin(p.time * 1.4 + this.seed);
    this.root.position.set(p.x, p.floorY, p.z);
    this.root.rotation.y = p.heading;
    if (this.dinerIndex >= 0) {
      this.sit(p);
      return;
    }

    const phase = p.stride + this.seed * 1.73;
    const step = Math.cos(phase), weight = Math.sin(phase);
    const rest = (1 - wave) * (.72 + .28 * Math.sin(p.time * .57 + this.seed)) * (this.seed % 2 ? 1 : -1);
    const crouch = T.MathUtils.clamp(p.crouch ?? 0, 0, 1);
    this.pelvis.position.set(
      .021 * rest - .021 * weight * wave,
      T.MathUtils.lerp(.877 + idle * .002, .850 - .028 * Math.cos(2 * phase), wave) - .20 * crouch,
      -.084 * crouch,
    );
    this.pelvis.rotation.set(0, .066 * step * wave + .04 * rest, -.036 * weight * wave - .03 * rest);
    inversePelvis.copy(this.pelvis.quaternion).invert();
    this.chest.rotation.set(.046 * wave + .085 * browse + .01 * idle + .32 * crouch,
      -.131 * step * wave - .06 * rest, .047 * weight * wave + .044 * rest);
    const glance = Math.sin(p.time * .69 + this.seed) * (.15 * browse + .048 * (1 - wave));
    this.head.rotation.set(.13 * browse + .022 * idle - .09 * crouch, .068 * step * wave + glance, .022 * browse);

    // During stance the ankle travels backwards at the speed of the root. The swing
    // returns it to the next heel strike with the same tangent as the planted foot.
    const stance = .55, strideLength = 1.38 / this.root.scale.z;
    for (let i = 0; i < this.legs.length; i++) {
      const { hip, knee, foot } = this.legs[i];
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
      const ankleY = .055 * Math.cos(pitch) + Math.sin(pitch) * (pitch > 0 ? .174 : -.066);
      ankleTarget.set(side * (.089 + .026 * crouch + .013 * arch * wave),
        ankleY + arch * wave * (.144 - .028 * swing),
        forward * wave + side * .036 * rest);
      ankleTarget.sub(this.pelvis.position).applyQuaternion(inversePelvis).sub(hip.position);
      const down = Math.hypot(ankleTarget.x, ankleTarget.y);
      const distance = T.MathUtils.clamp(Math.hypot(ankleTarget.z, down), .28, .8289);
      const thigh = .424, shin = .405;
      const hipFlex = -Math.atan2(ankleTarget.z, down) -
        Math.acos(T.MathUtils.clamp((thigh ** 2 + distance ** 2 - shin ** 2) / (2 * thigh * distance), -1, 1));
      const kneeFlex = Math.acos(T.MathUtils.clamp((distance ** 2 - thigh ** 2 - shin ** 2) / (2 * thigh * shin), -1, 1));
      const roll = Math.atan2(ankleTarget.x, -ankleTarget.y);
      hip.rotation.set(hipFlex, 0, roll, "ZXY");
      knee.rotation.x = kneeFlex;
      foot.rotation.set(pitch - hipFlex - kneeFlex, side * .058, -roll - this.pelvis.rotation.z);
    }
    for (let i = 0; i < this.arms.length; i++) {
      const { shoulder, elbow } = this.arms[i];
      const side = i * 2 - 1, swing = -side * step;
      const reach = i === 1 ? browse : 0;
      shoulder.rotation.set(.34 * swing * wave - .66 * reach - .08 * (1 - wave),
        -side * .074, side * (.094 + .026 * wave + .011 * idle));
      elbow.rotation.x = -.22 - .25 * Math.max(0, -swing) * wave - .63 * reach +
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
}

export function makeShopperBatch(scene: T.Group, count: number, seedOffset: number, faceMaterial:T.Material, dinerStart = count, workerStart = dinerStart, cashierStart = workerStart) {
  const people = Array.from({ length: count }, (_, i) => new Shopper(i + seedOffset, i >= dinerStart ? i - dinerStart : -1, i >= workerStart && i < dinerStart, i >= cashierStart && i < workerStart));
  const grouped = new Map<Form, Part[]>();
  for (const person of people) for (const part of person.parts) {
    const pile = grouped.get(part.form) ?? [];
    pile.push(part);
    grouped.set(part.form, pile);
  }
  const clothing = new T.MeshStandardMaterial({ roughness: .84, side: T.DoubleSide });
  // Skin keeps a soft specular and a warm grazing sheen, as light scattering under the surface does.
  const skin = new T.MeshPhysicalMaterial({ roughness: .5, side: T.DoubleSide, specularIntensity: .45,
    sheen: .35, sheenRoughness: .55, sheenColor: new T.Color("#ff9c7c") });
  const shadows = new T.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const fabrics = new Map<string,T.Material>();
  const textiles = new Map<Garment, T.Texture>();
  const followsHip = (form: Form) => ["apron", "shirt", "tunic", "workwear", "linen", "hem"].includes(form);
  function materialFor(form:Form) {
    if(form==="shadow")return shadows;
    if(form==="face")return faceMaterial;
    if(form==="head"||form==="forearm"||form==="hand")return skin;
    const fabric: Garment | null = form==="workwear"||form==="shirt"||form==="tunic"||form==="linen"||form==="hair" ? form :
      form==="thigh"||form==="shin" ? "denim" : form==="sleeve"||form==="apron" ? "linen" : form==="hem" ? "tunic" : null;
    if(!fabric)return clothing;
    const draped = followsHip(form);
    const key = fabric + (draped ? "-draped" : "");
    if (!fabrics.has(key)) {
      if (!textiles.has(fabric)) textiles.set(fabric, clothTexture(fabric));
      // Woven cloth catches a soft sheen at grazing angles; hair a tighter glint.
      const hair = fabric === "hair";
      const material = new T.MeshPhysicalMaterial({ map: textiles.get(fabric), roughness: hair ? .5 : .88,
        sheen: hair ? .7 : .4, sheenRoughness: hair ? .3 : .8, sheenColor: new T.Color(hair ? "#8c7a6a" : "#ffffff") });
      if (draped) {
        // Fabric below each hip follows that thigh. The middle stretches between the two legs.
        material.onBeforeCompile = shader => {
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute vec2 hemSwing;")
            .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
              float legSlope = mix(hemSwing.x, hemSwing.y, smoothstep(-.064, .064, position.x));
              objectNormal.y += objectNormal.z * legSlope * (1.0 - smoothstep(.005, .05, position.y));`)
            .replace("#include <begin_vertex>", `#include <begin_vertex>
              transformed.z += legSlope * max(0.0, .028 - position.y);`);
        };
      }
      fabrics.set(key, material);
    }
    return fabrics.get(key)!;
  }
  const tones = new Map<string, T.Color>();
  const batches = Array.from(grouped, ([form, parts]) => {
    const geo = humanGeometry(form);
    const portraits = form === "face"
      ? new T.InstancedBufferAttribute(new Float32Array(parts.length), 1).setUsage(T.DynamicDrawUsage) : null;
    if (portraits) geo.setAttribute("portraitCell", portraits);
    const hemSwing = followsHip(form)
      ? new T.InstancedBufferAttribute(new Float32Array(parts.length * 2), 2).setUsage(T.DynamicDrawUsage) : null;
    if (hemSwing) geo.setAttribute("hemSwing", hemSwing);
    const mesh = new T.InstancedMesh(geo, materialFor(form), parts.length);
    mesh.name="Shopper "+form;
    mesh.frustumCulled = false;
    mesh.receiveShadow = form !== "shadow";
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const tinted = form !== "shadow" && form !== "face";
    if (tinted) for (const part of parts) {
      if (!tones.has(part.color)) tones.set(part.color, new T.Color(part.color));
    }
    scene.add(mesh);
    return { mesh, form, parts, portraits, hemSwing, tinted, active: [] as Part[] };
  });
  const matrix = new T.Matrix4();
  // Sun shadows: each figure's simplified silhouette flattened onto its own floor along the sun direction.
  const casters = people.flatMap(person => person.parts.filter(part => part.form === "silhouette"));
  const shade = sunShadowMaterial();
  const sunShadows = new T.InstancedMesh(humanGeometry("silhouette"), shade, casters.length);
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
    for (const {mesh, form, parts, active, portraits, tinted} of batches) {
      active.length = 0;
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j], person = part.actor;
        const usesDetail = form === "shadow" || (form === "silhouette" ? !person.detailed : person.detailed);
        if (!person.visible || !usesDetail) continue;
        const index = active.length;
        active.push(part);
        if (tinted) mesh.setColorAt(index, tones.get(part.color)!);
        if (portraits) portraits.setX(index, person.portraitIndex);
      }
      mesh.count = active.length;
      mesh.visible = mesh.count > 0;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (portraits) portraits.needsUpdate = true;
    }
  }
  function syncInstances() {
    for (const { mesh, active, hemSwing } of batches) {
      if (!mesh.count) continue;
      for (let i = 0; i < active.length; i++) {
        const part = active[i];
        mesh.setMatrixAt(i, matrix.multiplyMatrices(part.joint.matrixWorld, part.local));
        if (hemSwing) {
          const { chest, legs } = part.actor;
          // A seated lap folds back at the hem. Limit the deformation near a horizontal thigh.
          const left = T.MathUtils.clamp(chest.rotation.x - legs[0].hip.rotation.x, -1.04, 1.08);
          const right = T.MathUtils.clamp(chest.rotation.x - legs[1].hip.rotation.x, -1.04, 1.08);
          hemSwing.setXY(i, Math.tan(left), Math.tan(right));
        }
      }
      if (hemSwing) hemSwing.needsUpdate = true;
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
