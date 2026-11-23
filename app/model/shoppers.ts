import * as T from "three";
import { clothTexture, garmentGeometry, hairGeometry, headGeometry, portraitGeometry, type Garment } from "./shopperAppearance";

export type PersonPose = {
  x: number; z: number; floorY: number; heading: number;
  stride: number; walking: number; browsing: number; time: number;
};

type Form = "oval" | "linen" | "shirt" | "tunic" | "thigh" | "shin" | "sleeve" | "forearm" | "hand" | "foot" | "head" | "face" | "hair" | "hem" | "collar" | "bag" | "ring" | "shadow";
type Part = { actor: Shopper; joint: T.Object3D; form: Form; color: string; local: T.Matrix4 };

function profile(rings: [number, number][], sides = 12) {
  return new T.LatheGeometry(rings.map(([radius, height]) => new T.Vector2(radius, height)), sides);
}

function humanGeometry(form: Form) {
  switch (form) {
    case "linen": case "shirt": case "tunic": return garmentGeometry(false);
    case "hem": return garmentGeometry(true);
    case "thigh": return profile([[0, -1.02],[.265,-1.02],[.35,-.97],[.35,-.91],[.33,-.83],[.405,-.72],[.40,-.67],[.432,-.56],[.47,-.38],[.50,-.23],[.55,-.06],[.54,.06],[.40,.14],[0,.14]],17);
    case "shin": return profile([[0,-1.04],[.36,-1.04],[.39,-1],[.35,-.93],[.37,-.84],[.303,-.79],[.306,-.70],[.376,-.49],[.419,-.35],[.413,-.25],[.365,-.15],[.36,-.08],[.394,.015],[.29,.09],[0,.105]],16);
    case "sleeve": return profile([[0,-1],[.46,-1],[.50,-.985],[.495,-.94],[.465,-.91],[.485,-.75],[.50,-.65],[.475,-.55],[.51,-.41],[.55,-.20],[.54,-.02],[.47,.095],[.33,.15],[0,.19]],15);
    case "forearm": return profile([[0,-1],[.26,-1],[.30,-.92],[.28,-.83],[.32,-.68],[.415,-.48],[.45,-.34],[.46,-.19],[.38,-.07],[.36,.02],[.26,.07],[0,.09]]);
    case "hand": {
      const g=profile([[0,-.133],[.28,-.131],[.62,-.115],[.78,-.089],[.94,-.064],[.97,-.035],[.80,-.007],[.66,.010],[0,.014]],12);
      g.scale(.027,1,.043);return g;
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
            index.push(k,next,next+10,k,next+10,k+10);
          }
        }
      });
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
const skinTones = ["#af7856", "#a5684b", "#c59574", "#94644b", "#bb8462", "#d2a185"];
const hairTones = ["#352a28", "#282929", "#463731", "#332e30", "#61534b"];

function joint(parent: T.Object3D, x: number, y: number, z: number) {
  const result = new T.Object3D();
  result.position.set(x, y, z);
  parent.add(result);
  return result;
}

/** Each joint drives a handful of shared instances. All figures on a level use one batch per shape. */
class Shopper {
  root = new T.Object3D();
  pelvis = joint(this.root, 0, .895, 0);
  chest = joint(this.pelvis, 0, .012, 0);
  head = joint(this.chest, 0, .528, 0);
  legs: { hip: T.Object3D; knee: T.Object3D; foot: T.Object3D }[] = [];
  arms: { shoulder: T.Object3D; elbow: T.Object3D }[] = [];
  parts: Part[] = [];
  visible = true;
  portraitIndex: number;
  constructor(readonly seed: number) {
    const shirt = clothes[(seed * 7 + 2) % clothes.length], trousersColor = trousers[(seed * 5 + 1) % trousers.length];
    this.portraitIndex = (seed * 5 + Math.floor(seed / 8)) % 8;
    const skin = skinTones[this.portraitIndex % skinTones.length];
    const hair = this.portraitIndex===2 || this.portraitIndex===5 ? "#68625b" : hairTones[(seed * 3) % hairTones.length];
    const shoes = ["#37312c", "#ddd0b5", "#4a3a33", "#ebe6d9"][(seed * 3) % 4];
    const tunic = seed % 3 === 0, longHair = this.portraitIndex % 2 === 0, shoppingBag = seed % 4 === 0 || seed % 5 === 1;
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
    this.root.scale.set(breadth, height, breadth);
    put(this.root, "shadow", "#ffffff", 0, .009, .025, .72, 1.08, 1, -Math.PI / 2);
    const garment = tunic ? "tunic" : seed % 5===0 ? "linen" : "shirt";
    const shoulderWidth = longHair ? .92 : 1.03;
    put(this.chest, garment, shirt, 0, 0, 0, shoulderWidth, 1, 1);
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
    if (longHair) {
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
      put(hip, "thigh", trousersColor, 0, 0, 0, .171, .426, .182);
      put(knee, "oval", trousersColor, 0, -.002, -.006, .132, .137, .145);
      put(knee, "shin", trousersColor, 0, .004, -.009, .163, .389, .161);
      put(foot, "foot", shoes, 0, 0, .012, 1, 1, 1);
      put(foot, "oval", "#776e61", 0, -.046, .061, .128, .019, .252);
      const shoulder = joint(this.chest, side * .166, .402, 0);
      const elbow = joint(shoulder, 0, -.266, 0);
      this.arms.push({ shoulder, elbow });
      put(shoulder, "sleeve", shirt, 0, .009, 0, .124, (tunic ? .268 : .166), .143);
      if (!tunic) put(shoulder, "forearm", skin, 0, -.142, 0, .102, .131, .114);
      put(elbow, "forearm", skin, 0, .006, .001, .103, .237, .114);
      put(elbow, "hand", skin, 0, -.230, .005, 1, .89, 1);
      put(elbow, "oval", skin, -side*.018, -.266, .032, .025, .058, .024, -.26,0,-side*.23);
      if (shoppingBag && side === -1) {
        put(elbow, "ring", "#ad8b63", -.018, -.32, .005, .100, .12, .18, 0, Math.PI / 2);
        put(elbow, "bag", seed % 3 === 0 ? "#ab704e" : "#c2a87c", -.035, -.467, .005, .12, .23, .22, 0, -.07);
      }
    }
  }
  pose(p: PersonPose) {
    const step = Math.sin(p.stride), bob = Math.cos(2 * p.stride);
    const wave = p.walking, browse = p.browsing;
    const idle = Math.sin(p.time * 1.4 + this.seed);
    this.root.position.set(p.x, p.floorY, p.z);
    this.root.rotation.y = p.heading;
    const rest=(1-wave) * (this.seed%2 ? 1 : -1);
    this.pelvis.position.x=.024*rest + .018*step*wave;
    this.pelvis.position.y = .877 + (.006 + .026 * bob) * wave + idle * .003 * (1 - wave);
    this.pelvis.rotation.set(0, .07*step*wave+.04*rest, .025*step*wave-.045*rest);
    this.chest.rotation.set(.043*wave+.092*browse+.012*idle, -.139*step*wave-.062*rest, .036*step*wave+.055*rest);
    this.head.rotation.set(.14 * browse + .035 * idle, -.14 * step * wave + .23 * Math.sin(p.time * .76 + this.seed) * browse, .035 * browse);
    this.legs.forEach(({ hip, knee, foot }, i) => {
      const phase = p.stride + i * Math.PI;
      const bend = Math.max(0, Math.cos(phase));
      hip.rotation.x = -Math.sin(phase) * .56 * wave - .059 - .065*rest*(i*2-1);
      knee.rotation.x = .12 + Math.pow(bend, 2) * .82 * wave+.069*rest*(i*2-1);
      foot.rotation.x = .02 - (hip.rotation.x + knee.rotation.x) * .80;
    });
    this.arms.forEach(({ shoulder, elbow }, i) => {
      const side = i * 2 - 1, swing = step * (i === 0 ? 1 : -1);
      const reach = i === 1 ? browse : 0;
      shoulder.rotation.set(.37*swing*wave-.66*reach-.08*(1-wave), -side*.076, side*(.105+.02*wave));
      elbow.rotation.x = -.23-.22*Math.max(0,-swing)*wave-.63*reach+.05*idle*reach-.04*(1-wave)*(this.seed%3);
    });
    this.root.updateMatrixWorld(true);
  }
}

export function makeShopperBatch(scene: T.Group, count: number, seedOffset: number, faceMaterial:T.Material) {
  const people = Array.from({ length: count }, (_, i) => new Shopper(i + seedOffset));
  const grouped = new Map<Form, Part[]>();
  for (const person of people) for (const part of person.parts) {
    const pile = grouped.get(part.form) ?? [];
    pile.push(part);
    grouped.set(part.form, pile);
  }
  const clothing = new T.MeshStandardMaterial({ roughness: .84, side: T.DoubleSide });
  const shadows = new T.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const fabrics = new Map<Garment,T.Material>();
  function materialFor(form:Form) {
    if(form==="shadow")return shadows;
    if(form==="face")return faceMaterial;
    const fabric: Garment | null = form==="shirt"||form==="tunic"||form==="linen"||form==="hair" ? form :
      form==="thigh"||form==="shin" ? "denim" : form==="sleeve" ? "linen" : form==="hem" ? "tunic" : null;
    if(!fabric)return clothing;
    if(!fabrics.has(fabric))fabrics.set(fabric,new T.MeshStandardMaterial({map:clothTexture(fabric), roughness:.88}));
    return fabrics.get(fabric)!;
  }
  const batches = Array.from(grouped, ([form, parts]) => {
    const geo=humanGeometry(form);
    if(form==="face")geo.setAttribute("portraitCell",new T.InstancedBufferAttribute(new Float32Array(parts.map(p=>p.actor.portraitIndex)),1));
    const mesh = new T.InstancedMesh(geo, materialFor(form), parts.length);
    mesh.name="Shopper "+form;
    mesh.frustumCulled = false;
    mesh.receiveShadow = form !== "shadow";
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (form !== "shadow" && form!=="face") parts.forEach((part, i) => mesh.setColorAt(i, new T.Color(part.color)));
    scene.add(mesh);
    return { mesh, parts };
  });
  const matrix = new T.Matrix4();
  const hidden = new T.Matrix4().makeScale(.0001,.0001,.0001).setPosition(0,-1000,0);
  function syncInstances() {
    for (const { mesh, parts } of batches) {
      parts.forEach((part, i) => mesh.setMatrixAt(i, part.actor.visible ? matrix.multiplyMatrices(part.joint.matrixWorld, part.local) : hidden));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return {
    update(poses: PersonPose[]) {
      people.forEach((person, i) => person.pose(poses[i]));
      syncInstances();
    },
    setCameraPosition(camera:T.Vector3) {
      let changed=false;
      for(const person of people){
        const {x,y,z}=person.root.position;
        const sameLevel=camera.y>=y-.16 && camera.y<=y+1.95*person.root.scale.y;
        // Hysteresis keeps a person from flashing at the edge of the personal-space radius.
        const radius=person.visible?.74:.88;
        const visible=!sameLevel || (camera.x-x)**2+(camera.z-z)**2>radius**2;
        if(visible!==person.visible){person.visible=visible;changed=true;}
      }
      if(changed)syncInstances();
    },
  };
}
