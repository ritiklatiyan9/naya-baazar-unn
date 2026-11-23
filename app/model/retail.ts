import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Floor, Unit } from "./geometry";
import { checkoutDepth, checkoutTop, shopCheckout } from "./shopCheckouts";
import { cafeShopIds } from "./marketPlaces";
import { displayCount, displayDepth, shelfWidth, glassSetback, retailBays, shopEntrance, shopFloorHeight } from "./retailFrontages";
import { facadeFinish } from "./siteMaterials";
import { shellBoundaries, wingBoundaries } from "./wings";
import { floristBloom, floristLeaf, hangingShirt } from "./merchandiseGeometry";

const themes = [
  { name: "THREAD", sub: "CLOTHING ATELIER", sign: "#713c38", wall: "#d1ad9a", accent: "#7e4d45", trim: "#ceae83" },
  { name: "BOUND", sub: "BOOKS & JOURNALS", sign: "#283e47", wall: "#c6b18f", accent: "#384f56", trim: "#bf9877" },
  { name: "KILN", sub: "CERAMIC STUDIO", sign: "#85543e", wall: "#d7c3a4", accent: "#a36a50", trim: "#caa480" },
  { name: "COURTYARD", sub: "COFFEE ROASTERS", sign: "#423830", wall: "#bd9d78", accent: "#705044", trim: "#b99666" },
  { name: "BOTANICA", sub: "PLANTS & FLOWERS", sign: "#385649", wall: "#b9bfa9", accent: "#657b65", trim: "#b8a17b" },
  { name: "FORM & FIELD", sub: "FURNITURE & LIVING", sign: "#565549", wall: "#c2b9a6", accent: "#8c9e90", trim: "#bf9f7e" },
  { name: "PETAL & GRAIN", sub: "NEIGHBOURHOOD BAKERY", sign: "#78564e", wall: "#e0c8b0", accent: "#a17461", trim: "#d0ac82" },
  { name: "INDIGO", sub: "HANDWOVEN TEXTILES", sign: "#334960", wall: "#c3b7ac", accent: "#516681", trim: "#c0a885" },
] as const;

function signAtlas() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  themes.forEach((theme, i) => {
    const y = i * 128;
    c.fillStyle = theme.sign;
    c.fillRect(0, y, 1024, 128);
    c.strokeStyle = theme.trim;
    c.lineWidth = 2;
    c.strokeRect(8, y + 7, 1008, 114);
    c.fillStyle = "#ffefcc";
    c.textAlign = "center";
    c.font = (i % 2 ? "500 60px Georgia, serif" : "600 59px Arial, sans-serif");
    c.fillText(theme.name, 512, y + 72, 890);
    c.font = "500 19px Arial, sans-serif";
    c.fillText(theme.sub.split("").join(" "), 512, y + 104);
  });
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

type Vec = T.Vector3;
type UvRect = { left: number; right: number; bottom: number; top: number };
const fullUv: UvRect = {left: 0, right: 1, bottom: 0, top: 1};
function tileUv(index: number, columns: number, rows: number, mirrored: boolean): UvRect {
  const column = index % columns, row = Math.floor(index / columns);
  // Inset from tile edges so mipmapped signs and display photographs retain their own borders.
  const left = (column + .012) / columns, right = (column + .988) / columns;
  return {left: mirrored ? right : left, right: mirrored ? left : right,
          bottom: 1 - (row + .988) / rows, top: 1 - (row + .012) / rows};
}

class Faces {
  position: number[] = [];
  color: number[] = [];
  uv: number[] = [];
  quad(a: Vec, b: Vec, c: Vec, d: Vec, bottom: string, top = bottom, uv = fullUv) {
    const lower = new T.Color(bottom), upper = new T.Color(top);
    const vertices = [a,b,c,a,c,d];
    const {left, right, bottom: v0, top: v1} = uv;
    this.uv.push(left,v0, right,v0, right,v1, left,v0, right,v1, left,v1);
    vertices.forEach((v,i) => {
      this.position.push(v.x,v.y,v.z);
      const tint = i === 2 || i >= 4 ? upper : lower;
      this.color.push(tint.r,tint.g,tint.b);
    });
  }
  add(group: T.Object3D, material: T.Material) {
    const geom = new T.BufferGeometry();
    geom.setAttribute("position", new T.Float32BufferAttribute(this.position, 3));
    geom.setAttribute("color", new T.Float32BufferAttribute(this.color, 3));
    geom.setAttribute("uv", new T.Float32BufferAttribute(this.uv, 2));
    geom.computeVertexNormals();
    const mesh = new T.Mesh(geom, material);
    group.add(mesh);
    return mesh;
  }
}

// Revolve the inner lip as well as the outside so vessels still read as hollow
// from the eye-level walkthrough, especially on the lower shelves.
function thrownPot(profile: number[][]) {
  const geometry = new T.LatheGeometry(profile.map(([r,h]) => new T.Vector2(r, h - .5)), 18);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const h = positions.getY(i) + .5;
    const shade = h < .09 ? .67 : .945 + .035 * Math.cos(h * 70);
    colors.set([shade, shade * .99, shade * .97], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  return geometry;
}
const forms = {
  box: () => new T.BoxGeometry(1,1,1),
  lamp: () => new T.BoxGeometry(1,1,1),
  round: () => new T.SphereGeometry(.5,10,6),
  vase: () => thrownPot([[.20,0],[.24,.06],[.40,.23],[.46,.44],[.41,.60],[.23,.78],[.15,.87],[.15,.97],[.18,.99],[.175,1],[.115,.99],[.115,.91],[0,.70]]),
  bowl: () => thrownPot([[.18,0],[.21,.09],[.20,.18],[.32,.32],[.43,.58],[.50,.91],[.50,.98],[.47,1],[.45,.92],[.38,.62],[.27,.39],[.13,.29],[0,.27]]),
  cylinder: () => new T.CylinderGeometry(.5,.5,1,12),
  shade: () => new T.CylinderGeometry(.21,.5,1,12),
  shirt: hangingShirt,
  leaf: floristLeaf,
  bloom: floristBloom,
};
type Form = keyof typeof forms;
// After dark the shop lighting lifts every interior surface in proportion to its own colour.
function litAfterDark(material: T.MeshStandardMaterial, glow: T.IUniform<number>) {
  material.onBeforeCompile = shader => {
    shader.uniforms.shopGlow = glow;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float shopGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * shopGlow;");
  };
  return material;
}
class Fixtures {
  pieces = new Map<Form, { m: T.Matrix4; c: T.Color }[]>();
  put(form: Form, color: string, center: Vec, width: number, height: number, depth: number, yaw=0, lean=0, pitch=0) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,lean,"YXZ"));
    const m = new T.Matrix4().compose(center,q,new T.Vector3(width,height,depth));
    const entry = this.pieces.get(form) ?? [];
    entry.push({m,c:new T.Color(color)});
    this.pieces.set(form,entry);
  }
  add(group: T.Group, glow: T.IUniform<number>) {
    const standard = litAfterDark(new T.MeshStandardMaterial({roughness:.68,metalness:.09}), glow);
    const glaze = litAfterDark(new T.MeshStandardMaterial({vertexColors:true, roughness:.27}), glow);
    const matte = litAfterDark(new T.MeshStandardMaterial({vertexColors:true, roughness:.92, side:T.DoubleSide}), glow);
    for (const [form,instances] of this.pieces) {
      const material = form === "lamp" ? new T.MeshBasicMaterial({toneMapped:false}) :
        form === "vase" || form === "bowl" ? glaze :
        form === "shirt" || form === "leaf" || form === "bloom" ? matte : standard;
      const mesh = new T.InstancedMesh(forms[form](),material,instances.length);
      mesh.name = "Retail " + form;
      instances.forEach(({m,c},i) => { mesh.setMatrixAt(i,m); mesh.setColorAt(i,c); });
      group.add(mesh);
    }
  }
}

function glazing() {
  // Angle-dependent sky and horizon reflections, with enough transmission to see the display behind each pane.
  const material = new T.ShaderMaterial({
    side:T.DoubleSide, transparent:true, depthWrite:false,
    uniforms: { night: { value: 0 } },
    vertexShader: `
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec4 p=vec4(position,1.0); vec3 n=normal;
        #ifdef USE_INSTANCING
          p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
        #endif
        vec4 w=modelMatrix*p;
        vWorld=w.xyz; vNormal=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: `
      uniform float night;
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec3 v=normalize(cameraPosition-vWorld); vec3 n=normalize(vNormal);
        float fresnel=pow(1.0-abs(dot(v,n)),3.0);
        vec3 r=reflect(-v,n);
        float skylight=smoothstep(-.16,.38,r.y);
        float streak=smoothstep(.94,1.0,cos(13.0*r.x+7.0*r.z+1.9*r.y))*skylight*(1.0-night);
        vec3 tint=mix(vec3(.15,.24,.23),vec3(.68,.82,.85),skylight);
        // After dark the panes only catch a faint reflection of the night sky.
        tint=mix(tint,mix(vec3(.008,.011,.02),vec3(.03,.04,.07),skylight),night);
        gl_FragColor=vec4(tint,(.085+.30*fresnel+.10*streak)*(1.0-.45*night));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.forceSinglePass = true;
  return material;
}

type Arrangement = (form:Form, color:string, x:number, y:number, depth:number, width:number, height:number, zsize:number, turn?:number, lean?:number, pitch?:number) => void;
const pottery = ["#d6c7ae","#af7455","#6b938b","#dfbb84","#85716b"];
const cloth = ["#c6a66a","#778a85","#eee0bf","#885848","#566579","#c49588"];
const spines = ["#ae6548","#e3c68e","#566b70","#7d8a66","#b89175","#6f544b","#aab7ab"];

function merchandise(place: Arrangement, theme:number, span:number, variation:number) {
  const w = shelfWidth(span);
  const rack = "#6e5843", brass = "#b19a70";
  switch (theme) {
    case 0: { // Garments hang at slightly different angles along the brass rail.
      place("box",rack,0,.13,1.94,w+.1,.18,.57);
      place("box",brass,0,1.94,1.96,w,.045,.045);
      for (const x of [-w*.48,w*.48]) place("box",brass,x,1.0,1.96,.04,1.85,.04);
      for (let i=0;i<5;i++) {
        const x=(i-2)*w*.18;
        const turn = .18 + ((i+variation)%3)*.16;
        place("cylinder",brass,x,1.856,1.95,.012,.17,.012);
        for(const side of [-1,1])
          place("box","#ab7951",x+side*.065*Math.cos(turn),1.75,1.95-side*.065*Math.sin(turn),.15,.020,.022,turn,-side*.29);
        place("shirt",cloth[(i+variation)%cloth.length],x,1.39,1.95,.60,1.18,.9,turn);
      }
      break;
    }
    case 1: { // Book spines, varying page heights and a face-out cover.
      for (let row=0;row<3;row++) {
        const y=.41+row*.60;
        place("box",rack,0,y,2.0,w,.055,.40);
        for(let i=0;i<8;i++){
          const h=.24+((i+row+variation)%4)*.035;
          place("box",spines[(i*3+row+variation)%spines.length],(i-3.5)*w*.103,y+h/2+.032,1.98,.085+(i%3)*.027,h,.20,0,(i===7?.13:0));
        }
      }
      place("box","#d4ac74",w*.35,1.78,1.80,.23,.31,.025);
      break;
    }
    case 2: { // Handmade ceramics stacked on floating oak shelves.
      for(let row=0;row<2;row++){
        const y=.65+row*.83;
        place("box",rack,0,y,1.98,w,.055,.47);
        for(let i=0;i<4;i++){
          const h=.24+((i+variation+row)%3)*.10;
          const x = (i-1.5)*w*.235;
          const tint = pottery[(variation+i+row)%pottery.length];
          if ((variation+i+row)%3 === 0) {
            const diameter = Math.min(.29, w * .22);
            place("bowl",tint,x,y+.095,1.94,diameter,.13,diameter);
            place("bowl",tint,x,y+.132,1.94,diameter*.97,.13,diameter*.97);
          } else {
            const diameter = Math.min(.23+(i%2)*.06, w*.21);
            place("vase",tint,x,y+h/2+.032,1.94,diameter,h,diameter);
          }
        }
      }
      break;
    }
    case 3: { // Fluted coffee bar, espresso machine, cups and grinders.
      place("box","#916b4c",0,.46,1.98,w,.90,.59);
      place("box","#e1d4ba",0,.94,1.95,w+.08,.095,.67);
      for(let i=0;i<9;i++) place("box","#b68c64",(i-4)*w*.107,.47,1.665,.023,.80,.027);
      place("box","#5e605a",-w*.16,1.21,1.91,.58,.44,.34);
      place("box","#c1b8a4",-w*.16,1.33,1.72,.52,.10,.12);
      for(const x of [w*.12,w*.33]) place("cylinder","#ede5cf",x,1.06,1.78,.12,.16,.12);
      place("cylinder","#966f48",w*.35,1.35,2.03,.16,.48,.16);
      break;
    }
    case 4: { // Potted foliage and cut stems, with individual blades and flower heads.
      place("box",rack,0,.38,1.99,w,.10,.53);
      for(let i=0;i<4;i++){
        const x=(i-1.5)*w*.222, height=.41+((variation+i)%3)*.09;
        place("vase",pottery[(i+variation)%5],x,.585,1.96,.21,.31,.21);
        for(let j=0;j<3;j++){
          const s=j-1, length=height*(1-.17*Math.abs(s)), top=.68+length;
          const shift=s*.061;
          place("cylinder","#617449",x+shift*.5,.68+length*.5,1.96+s*.018,.010,length,.010,0,-s*.13);
          for(const side of [-1,1]) {
            const y=.74+length*(side>0?.56:.23);
            place("leaf",side>0?"#779753":"#527341",x+shift*.7+side*.048,y,1.94+s*.025,
              .10,.21,.11,.3*s,-side*.63);
          }
          if(i%2===0) place("bloom",i===0?"#d29b88":"#e3ca93",x+shift,top,1.96+s*.018,.16,.14,.16,.6*j,s*.40);
          else place("leaf","#80975e",x+shift,top-.015,1.95,.085,.19,.10,j,.24*s);
        }
      }
      break;
    }
    case 5: { // Upholstered lounge chair and an adjacent reading lamp.
      const wide=Math.min(w*.60,.85);
      place("box","#b3a18c",-w*.17,.23,1.91,wide,.26,.59);
      place("box","#83978e",-w*.17,.47,1.93,wide,.22,.59);
      place("box","#8fa095",-w*.17,.76,2.13,wide,.53,.14);
      for(const side of [-1,1]) place("box","#83948c",-w*.17+side*wide*.5,.57,1.91,.12,.43,.58);
      place("cylinder",brass,w*.34,.74,1.99,.035,1.49,.035);
      place("cylinder","#70665b",w*.34,.055,1.99,.29,.055,.29);
      place("shade","#ddc493",w*.34,1.48,1.99,.38,.33,.38);
      break;
    }
    case 6: { // Bakery counter with crusted loaves and a small film-glass display.
      place("box","#a78363",0,.49,1.99,w,.94,.60);
      place("box","#d3c4b1",0,.98,1.96,w+.06,.09,.62);
      for(let i=0;i<5;i++){
        const x=(i-2)*w*.172;
        place("round",i%2?"#cd8c48":"#ad6d3f",x,1.10,1.91,.22,.18,.32,.15);
        place("box","#e4b77a",x,1.185,1.91,.09,.014,.035,.40);
      }
      for(const x of [-w*.47,w*.47])place("box",brass,x,1.20,1.72,.025,.49,.025);
      place("box","#ebdcc1",0,1.47,1.92,w,.035,.46);
      break;
    }
    default: { // Folded linens styled with glazed vessels in the window display.
      for(let row=0;row<2;row++){
        const y=.48+row*.77;
        place("box",rack,0,y,1.99,w,.055,.52);
        for(let i=0;i<2;i++)
          for(let fold=0;fold<3;fold++)
            place("box",cloth[(variation+i+fold)%cloth.length],(i-.35)*w*.32,y+.09+fold*.085,1.96,w*.25,.078,.36-.02*fold);
        const diameter=Math.min(.25,w*.18);
        place("vase",row ? "#57958e" : "#b77955",-w*.37,y+.165,1.92,diameter,.27,diameter);
        place("vase",row ? "#c3a275" : "#846565",-w*.28,y+.225,2.04,diameter*.78,.39,diameter*.78);
      }
    }
  }
}

function checkoutFixtures(place: Arrangement, width: number, theme: typeof themes[number], themeIndex: number, inwardSign: number) {
  const depth = checkoutDepth, top = checkoutTop;
  place("box", "#554c42", 0, .055, depth, width - .15, .11, .47);
  place("box", theme.accent, 0, .49, depth, width - .06, .79, .50);
  const ribs = Math.floor(width / .09);
  for (let i = 0; i < ribs; i++) {
    place("box", theme.trim, (i + .5 - ribs / 2) * .09, .49, depth - .258, .026, .73, .022);
  }
  place("box", "#b4996b", 0, top - .074, depth, width, .022, .555);
  place("box", "#dfd5c4", 0, top - .033, depth, width, .066, .57);

  // A raised staff terminal and the small customer display face opposite sides of the desk.
  const till = -.13, monitorDepth = depth + .11;
  place("box", "#393e3c", till, top + .015, monitorDepth, .23, .030, .16);
  place("box", "#575950", till, top + .098, monitorDepth, .047, .16, .055);
  place("box", "#2c3533", till, top + .235, monitorDepth, .32, .224, .032, 0, 0, -.16 * inwardSign);
  place("box", "#a6b8aa", till, top + .236, monitorDepth + .022, .29, .194, .009, 0, 0, -.16 * inwardSign);
  place("box", "#434842", till, top + .115, depth - .030, .17, .090, .027);
  place("box", "#b5c4a4", till, top + .115, depth - .047, .145, .062, .008);
  // A payment keypad and thermal printer sit within reach of the cashier.
  const reader = till - .13, readerDepth = depth - .145;
  place("box", "#303b3b", reader, top + .032, readerDepth, .10, .055, .137);
  place("box", "#82a69f", reader, top + .061, readerDepth + .033, .077, .008, .044);
  for (let i = 0; i < 3; i++) place("box", "#a5aea8", reader, top + .062, readerDepth - .047 + .016 * i, .068, .006, .008);
  const printer = width * .36;
  place("box", "#555754", printer, top + .069, depth + .10, .122, .138, .15);
  place("box", "#262c2b", printer, top + .139, depth + .089, .090, .007, .019);
  place("box", "#eee7d7", printer, top + .172, depth + .093, .072, .061, .007, 0, 0, -.24 * inwardSign);

  // Packaging stays on the narrow wall ledge beside the clerk's shoulder.
  const shelf = width * .31;
  place("box", "#927454", shelf, 1.43, 2.235, .37, .032, .21);
  for (let i = 0; i < 3; i++) {
    const x = shelf + (i - 1) * .098;
    const h = .162 + .033 * (i % 2), z = 2.23 + .016 * (i % 2);
    place("box", i === 1 ? "#8e7161" : "#bd9b76", x, 1.449 + h / 2, z, .108, h, .059);
    for (const side of [-1, 1]) place("cylinder", "#7f6851", x + side * .020, 1.465 + h, z, .006, .036, .006);
    place("box", "#7f6851", x, 1.483 + h, z, .043, .006, .006);
  }

  const pack = width * .13;
  place("box", "#857969", pack, top + .009, depth - .043, .235, .017, .241);
  if (themeIndex === 4) {
    place("vase", "#a97550", pack, top + .093, depth, .106, .149, .106);
    for (const side of [-1, 1]) {
      place("leaf", "#627d55", pack + side * .024, top + .215, depth, .057, .156, .060, 0, -.30 * side);
      place("bloom", "#b67772", pack + side * .031, top + .273, depth, .068, .052, .063);
    }
  } else if (themeIndex === 2 || themeIndex === 3) {
    place("bowl", "#93a99e", pack, top + .065, depth, .17, .10, .17);
  } else {
    place("box", "#a38672", pack, top + .035, depth, .20, .030, .17, .055);
    place("box", "#cec4ad", pack, top + .056, depth, .192, .025, .168, -.04);
  }
}

type Door = {
  id: number;
  hinge: Vec; center: Vec; width: number; yaw: number; inwardTurn: number; resting: number; angle: number;
};

function glassDoors(group:T.Group, doors:Door[], glassMaterial:T.Material) {
  const trimParts:T.BufferGeometry[]=[];
  function trim(cx:number,cy:number,cz:number,width:number,height:number,depth:number,color:string) {
    const g=new T.BoxGeometry(width,height,depth).toNonIndexed();
    g.translate(cx,cy,cz);
    const rgb=new T.Color(color), colors=new Float32Array(g.getAttribute("position").count*3);
    for(let i=0;i<colors.length;i+=3) { colors[i]=rgb.r;colors[i+1]=rgb.g;colors[i+2]=rgb.b; }
    g.setAttribute("color",new T.BufferAttribute(colors,3));
    trimParts.push(g);
  }
  for(const x of [.028,.972])trim(x,1.065,0,.034,2.10,.045,"#adaba4");
  for(const y of [.055,2.10])trim(.5,y,0,.95,.04,.046,"#bcb8aa");
  trim(.5,.88,0,.72,.014,.018,"#cbd8d0");
  for(const face of [-1,1]){
    trim(.81,1.12,face*.075,.028,.43,.03,"#c5b491");
    for(const y of [.94,1.30])trim(.81,y,face*.042,.029,.031,.067,"#b6a588");
  }
  const trimGeometry=mergeGeometries(trimParts)!;
  trimParts.forEach(g=>g.dispose());
  const trimMesh=new T.InstancedMesh(trimGeometry,new T.MeshStandardMaterial({vertexColors:true,metalness:.48,roughness:.32}),doors.length);
  const paneGeometry=new T.PlaneGeometry(.935,2.04);
  paneGeometry.translate(.5,1.07,0);
  const paneMesh=new T.InstancedMesh(paneGeometry,glassMaterial,doors.length);
  trimMesh.name="Retail entrance frames and pulls";
  paneMesh.name="Swing glass door leaves";
  trimMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  paneMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  // These bounds span the whole site. Turning the outer leaves should never cull a row of doors.
  const bound=new T.Box3();
  for(const door of doors)bound.expandByPoint(door.hinge);
  bound.expandByScalar(3);
  trimMesh.boundingSphere=bound.getBoundingSphere(new T.Sphere());
  paneMesh.boundingSphere=trimMesh.boundingSphere.clone();
  group.add(trimMesh,paneMesh);
  const matrix=new T.Matrix4(), rotation=new T.Quaternion(), scale=new T.Vector3(), up=new T.Vector3(0,1,0);
  function position(door:Door,index:number){
    rotation.setFromAxisAngle(up,door.yaw+door.angle*door.inwardTurn);
    matrix.compose(door.hinge,rotation,scale.set(door.width,1,1));
    trimMesh.setMatrixAt(index,matrix);
    paneMesh.setMatrixAt(index,matrix);
  }
  doors.forEach(position);
  return (eye:T.Vector3,delta:number,approaching:ReadonlySet<number>) => {
    let changed=false, moving=false;
    for(let i=0;i<doors.length;i++){
      const door=doors[i],height=eye.y-door.hinge.y;
      const near=height>.15 && height<2.6 && door.center.distanceToSquared(eye)<5.3;
      const target=(near || approaching.has(door.id)) ? Math.PI*.47 : door.resting;
      if(Math.abs(target-door.angle)<.0001)continue;
      const step=delta>=.5?1:1-Math.exp(-8*Math.max(0,delta));
      door.angle=T.MathUtils.lerp(door.angle,target,step);
      if(Math.abs(target-door.angle)<.006)door.angle=target;else moving=true;
      position(door,i);
      changed=true;
    }
    if(changed) {trimMesh.instanceMatrix.needsUpdate=true;paneMesh.instanceMatrix.needsUpdate=true;}
    return moving;
  };
}

type WallAtlas = { map:T.Texture; ready:boolean; panels:Set<T.Mesh> };
const wallAtlases = new WeakMap<()=>void,WallAtlas>();
function addPhotoWall(panels:Faces,group:T.Group,onReady?:()=>void) {
  if(typeof document==="undefined")return;
  let atlas=onReady?wallAtlases.get(onReady):undefined;
  if(!atlas) {
    const map=new T.TextureLoader().load("/media/retail-wall-atlas.webp",()=>{
      entry.ready=true;
      for(const mesh of entry.panels)mesh.visible=true;
      entry.panels.clear();
      onReady?.();
    },undefined,()=>entry.panels.clear());
    const entry:WallAtlas={map,ready:false,panels:new Set()};
    entry.map.colorSpace=T.SRGBColorSpace;
    entry.map.anisotropy=4;
    atlas=entry;
    if(onReady)wallAtlases.set(onReady,entry);
  }
  const panel=panels.add(group,new T.MeshBasicMaterial({map:atlas.map,color:"#f0dfc5",side:T.DoubleSide}));
  panel.name="Photographic retail displays";
  panel.visible=atlas.ready;
  if(!atlas.ready)atlas.panels.add(panel);
}

export function addRetail(group:T.Group, units:Unit[], floor:Floor, onMaterialsReady?:()=>void) {
  const setback = glassSetback[floor], base = shopFloorHeight[floor];
  const ceiling = floor === "ground" ? 2.91 : 2.86;
  const glass = new Faces(), interior = new Faces(), signs = new Faces(), photos = new Faces();
  const returns = new Faces(), doors:Door[]=[];
  const fittings = new Fixtures();
  const darkMetal="#3f4948";
  function beam(a:Vec,b:Vec,y:number,width:number,height:number,color:string) {
    const dx=b.x-a.x, dz=b.z-a.z;
    fittings.put("box",color,new T.Vector3((a.x+b.x)/2,base+y,(a.z+b.z)/2),Math.hypot(dx,dz),height,width,-Math.atan2(dz,dx));
  }
  if(floor === "first") {
    // The existing low ivory upstand carries a channel of clear safety glass along each open gallery.
    for(const wing of shellBoundaries) {
      let run = 0, nextPost = 0;
      for(let i=0;i<wing.points.length;i++){
        if(!wing.publicEdge[i]){ run=0; nextPost=0; continue; }
        const j=(i+1)%wing.points.length;
        const av=wing.points[i].clone().addScaledVector(wing.insets[i],.12);
        const bv=wing.points[j].clone().addScaledVector(wing.insets[j],.12);
        const length=av.distanceTo(bv);
        if(length < .001)continue;
        const a = new T.Vector3(av.x, base + .47, av.y), b = new T.Vector3(bv.x, base + .47, bv.y);
        const c = new T.Vector3(b.x, base + 1.08, b.z), d = new T.Vector3(a.x, base + 1.08, a.z);
        glass.quad(a,b,c,d,"#ffffff");
        beam(a,b,1.105,.052,.052,"#8a7b66");
        beam(a,b,.49,.044,.045,"#877f71");
        while(nextPost < run+length){
          const t = (nextPost - run) / length;
          const p = av.clone().lerp(bv, t);
          fittings.put("box","#a49a86",new T.Vector3(p.x,base+.81,p.y),.029,.62,.032);
          nextPost+=1.65;
        }
        run+=length;
      }
    }
  }
  const bays = wingBoundaries.flatMap(wing => retailBays(wing,units,floor));
  for(const arcade of bays) {
    const bay = arcade.shop ?? arcade, id = arcade.id;
    let themeIndex = (id * 3 + Math.floor(id / 7)) % themes.length;
    if (floor === "ground" && id === cafeShopIds.coffee) themeIndex = 3;
    if (floor === "ground" && id === cafeShopIds.bakery) themeIndex = 6;
    const theme=themes[themeIndex], half=bay.width/2;
    const point=(u:number,y:number,d:number)=>{
      const p=bay.at(u,d);
      return new T.Vector3(p.x,base+y,p.y);
    };
    const post=(a:Vec,b:Vec,w:number,c:string) => {
      fittings.put("box",c,a.clone().lerp(b,.5),w,Math.abs(b.y-a.y),w);
    };
    // The lit floor and continuous rear wall give a view right into each shop from the gallery.
    const aisleDepth=arcade.depth, deeper=aisleDepth-displayDepth;
    if (arcade.shop) {
      // Exposed ends face a covered gallery. Finish the outside of the actual partitions.
      const end = half + .025, rear = setback + aisleDepth + .025;
      const perimeter = [[-end, setback], [-end, rear], [end, rear], [end, setback]];
      for (let i = 1; i < perimeter.length; i++) {
        const [a, da] = perimeter[i-1], [b, db] = perimeter[i];
        returns.quad(point(a,0,da), point(b,0,db), point(b,ceiling,db), point(a,ceiling,da), facadeFinish.plaster);
      }
    }
    const parts=Math.max(2,Math.ceil(bay.width/.92));
    for(let i=0;i<parts;i++) {
      const u=-half+bay.width*i/parts, v=-half+bay.width*(i+1)/parts;
      const front=setback-.015, back=setback+aisleDepth;
      const f1=point(u,.004,front), f2=point(v,.004,front);
      const b1=point(u,.004,back), b2=point(v,.004,back);
      interior.quad(f1,f2,b2,b1,"#c9bdae","#ac9a84");
      interior.quad(b1,b2,point(v,ceiling,back),point(u,ceiling,back),theme.wall,"#e6d4b4");
      interior.quad(point(u,ceiling,back),point(v,ceiling,back),point(v,ceiling,front),point(u,ceiling,front),"#bda784","#d8c8aa");
    }
    const wallLeft=(u:number)=>{
      const d=setback+aisleDepth;
      interior.quad(point(u,0,setback),point(u,0,d),point(u,ceiling,d),point(u,ceiling,setback),theme.accent,theme.wall);
    };
    wallLeft(-half+.005);
    wallLeft(half-.005);
    const {center:doorCenter,halfWidth:doorHalf}=shopEntrance(bay.width);
    const l=doorCenter-doorHalf,r=doorCenter+doorHalf,doorH=2.13;
    const left=point(l,0,setback),right=point(r,0,setback);
    function fixedPane(u:number,v:number,low:number,high:number,frames:boolean) {
      const n=Math.max(1,Math.ceil((v-u)/1.40));
      for(let i=0;i<n;i++){
        const x=u+(v-u)*i/n,z=u+(v-u)*(i+1)/n;
        glass.quad(point(x,low,setback),point(z,low,setback),point(z,high,setback),point(x,high,setback),"#ffffff");
        if(frames || i>0)post(point(x,low,setback),point(x,high,setback),.052,darkMetal);
        if(low===0)beam(point(x,0,setback),point(z,0,setback),.045,.072,.08,darkMetal);
      }
    }
    fixedPane(-half,l,0,ceiling,true);
    fixedPane(r,half,0,ceiling,true);
    fixedPane(l,r,doorH,ceiling,false);
    for(const u of [l,r])post(point(u,0,setback),point(u,ceiling,setback),.062,darkMetal);
    beam(left,right,doorH+.035,.085,.07,darkMetal);
    const inward=point(doorCenter,0,setback+.2).sub(point(doorCenter,0,setback)).setY(0).normalize();
    const opening=right.clone().sub(left);
    const angle=id%4===1?.53:id%6===0?.22:0;
    const turnSign=Math.sign(opening.z*inward.x-opening.x*inward.z) || 1;
    doors.push({id,hinge:left,center:left.clone().lerp(right,.5).add(new T.Vector3(0,1.28,0)),width:opening.length(),
      yaw:-Math.atan2(opening.z,opening.x),inwardTurn:turnSign,resting:angle,angle});
    const boardWidth=Math.min(3.0,bay.width*.86);
    const signHeight=Math.min(.47,.21*boardWidth);
    const center=bay.width>6?doorCenter:0;
    const a=point(center-boardWidth/2,ceiling-.20-signHeight,setback-.115);
    const b=point(center+boardWidth/2,ceiling-.20-signHeight,setback-.115);
    const ca=a.clone().add(new T.Vector3(0,signHeight,0));
    const cb=b.clone().add(new T.Vector3(0,signHeight,0));
    const rightOnScreen=new T.Vector3(-inward.z,0,inward.x);
    const reverse=b.clone().sub(a).dot(rightOnScreen)<0;
    beam(a,b,ceiling-.20-signHeight/2,.09,signHeight,theme.sign);
    // Mount the lettered face just in front of its physical backing.
    for (const vertex of [a,b,ca,cb]) vertex.addScaledVector(inward,-.055);
    signs.quad(a,b,cb,ca,"#ffffff","#ffffff",tileUv(themeIndex,1,themes.length,reverse));

    const stalls=displayCount(bay.width), checkout = shopCheckout(arcade, floor, units);
    for(let i=0;i<stalls;i++) {
      const span=bay.width/stalls;
      const u=-half+span*(i+.5);
      const a=point(u-.16,0,setback), b=point(u+.16,0,setback);
      const yaw=-Math.atan2(b.z-a.z,b.x-a.x);
      const arrange:Arrangement=(form,color,x,y,d,w,h,z,turn=0,lean=0,pitch=0)=>{
        fittings.put(form,color,point(u+x,y,setback+deeper+d),w,h,z,yaw+turn,lean,pitch);
      };
      // Each upright photographic panel uses one tile of the local 4×2 merchandise atlas.
      const photoWidth=Math.min(span*.92,1.92), photoH=Math.min(2.52,photoWidth/0.75);
      const d=setback+aisleDepth-.045, y0=.10, y1=y0+photoH;
      const pl=point(u-photoWidth/2,y0,d),pr=point(u+photoWidth/2,y0,d);
      const mirror=pr.clone().sub(pl).dot(rightOnScreen)<0;
      if (checkout && i === checkout.stall) {
        const centre = checkout.along;
        const desk: Arrangement = (form, color, x, ...args) => arrange(form, color, x + centre - u, ...args);
        const inwardSign = Math.sign(inward.x * Math.sin(yaw) + inward.z * Math.cos(yaw));
        checkoutFixtures(desk, checkout.width, theme, themeIndex, inwardSign);
        const w = Math.min(1.27, checkout.width * .81), h = w / 7.1;
        const left = point(centre - w / 2, 1.94, d), right = point(centre + w / 2, 1.94, d);
        signs.quad(left, right, point(centre + w / 2, 1.94 + h, d), point(centre - w / 2, 1.94 + h, d),
          "#ffffff", "#ffffff", tileUv(themeIndex, 1, themes.length, mirror));
      } else {
        photos.quad(pl,pr,point(u+photoWidth/2,y1,d),point(u-photoWidth/2,y1,d),"#fff","#fff",tileUv(themeIndex,4,2,mirror));
        merchandise(arrange,themeIndex,span,id+i);
      }
      // Concealed warm light under the display header and the ceiling fixture read even in the covered arcade.
      arrange("box","#655749",0,ceiling-.055,.77,Math.min(1.25,span*.65),.085,.105);
      arrange("lamp","#ffe1a5",0,ceiling-.104,.77,Math.min(1.22,span*.62),.019,.075);
      if(themeIndex===3 || themeIndex===6){
        arrange("cylinder","#554c44",span*.22,ceiling-.23,1.50,.025,.44,.025);
        arrange("shade",theme.trim,span*.22,ceiling-.49,1.50,.31,.19,.31);
        arrange("lamp","#ffe4a9",span*.22,ceiling-.59,1.50,.18,.012,.16);
      }
    }
  }
  const glow={value:0};
  const roomFinish:T.MeshStandardMaterialParameters={vertexColors:true,side:T.DoubleSide,roughness:.85,emissive:"#b09474",emissiveIntensity:.075};
  const rooms=interior.add(group,litAfterDark(new T.MeshStandardMaterial(roomFinish),glow));
  rooms.name="Shop interiors";
  // The outside of an end shop's partitions faces the gallery, so it stays unlit at night.
  if (returns.position.length) returns.add(group,new T.MeshStandardMaterial(roomFinish)).name="Arcade wall returns";
  fittings.add(group,glow);
  const atlas=signAtlas();
  signs.add(group,new T.MeshBasicMaterial({map:atlas,color:atlas?"#fff7dd":"#514b40",side:T.DoubleSide})).name="Shop signs";
  const glassMaterial=glazing();
  glass.add(group,glassMaterial).name="Glass shop fronts";
  rooms.userData.night=(on:boolean)=>{
    glow.value=on?.75:0;
    glassMaterial.uniforms.night.value=on?1:0;
  };
  addPhotoWall(photos,group,onMaterialsReady);
  return glassDoors(group,doors,glassMaterial);
}
